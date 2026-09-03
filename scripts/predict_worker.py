#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lp-mode-web-simulator 的模态分解推理 Worker。

由 Node.js 后端通过标准输入传入 JSON 任务，从标准输出返回 JSON 结果。
支持两种任务：
  {"mode": "scan", "files": [模型绝对路径, ...]}
      -> 扫描模型：推断模式数量、骨干网络、模式标签。
  {"mode": "predict", "modelPath": "...", "near": [...224x224...],
   "far": [...], "size": 224}
      -> 加载模型并对近场/远场图像对做模态分解预测。

需要 Python 环境包含 torch / torchvision / timm / numpy / scipy / Pillow。
示例（先激活已安装依赖的 Python 环境）：
  python scripts/predict_worker.py
"""

import csv
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from scipy import fft as scipy_fft
from scipy import special
from torchvision import transforms
import timm

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

IMG_SIZE = 224
SUPPORTED_BACKBONES = [
    "efficientnet_b0",
    "vgg16",
    "resnet152",
    "mobilenetv3_small",
    "mobilenetv3_large",
    "mobilenetv4_small",
    "mobilenetv4_medium",
    "unet",
]
BACKBONE_NAME_MAP = {
    "vgg16": "vgg16",
    "mobilenetv3_large": "mobilenetv3_large_100",
    "mobilenetv3_small": "mobilenetv3_small_100",
    "mobilenetv4_small": "mobilenetv4_conv_small",
    "mobilenetv4_medium": "mobilenetv4_conv_medium",
    "resnet152": "resnet152",
    "efficientnet_b0": "efficientnet_b0",
    "unet": "unet",
}


def emit_progress(stage, progress, message, **extra):
    payload = {
        "stage": stage,
        "progress": float(max(0, min(100, progress))),
        "message": message,
        **extra,
    }
    print("LP_PROGRESS " + json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)


class ChannelAttention(nn.Module):
    def __init__(self, c, r=16):
        super().__init__()
        self.avg = nn.AdaptiveAvgPool2d(1)
        self.max = nn.AdaptiveMaxPool2d(1)
        self.fc = nn.Sequential(
            nn.Conv2d(c, c // r, 1, bias=False),
            nn.ReLU(True),
            nn.Conv2d(c // r, c, 1, bias=False),
        )
        self.sig = nn.Sigmoid()

    def forward(self, x):
        return self.sig(self.fc(self.avg(x)) + self.fc(self.max(x)))


class SpatialAttention(nn.Module):
    def __init__(self, k=7):
        super().__init__()
        self.conv = nn.Conv2d(2, 1, k, padding=k // 2, bias=False)
        self.sig = nn.Sigmoid()

    def forward(self, x):
        a = torch.mean(x, 1, True)
        m, _ = torch.max(x, 1, True)
        return self.sig(self.conv(torch.cat([a, m], 1)))


class CBAM(nn.Module):
    def __init__(self, c, r=16, k=7):
        super().__init__()
        self.channel_att = ChannelAttention(c, r)
        self.spatial_att = SpatialAttention(k)

    def forward(self, x):
        x = x * self.channel_att(x)
        return x * self.spatial_att(x)


class DoubleConv(nn.Module):
    def __init__(self, i, o):
        super().__init__()
        self.d = nn.Sequential(
            nn.Conv2d(i, o, 3, padding=1),
            nn.BatchNorm2d(o),
            nn.ReLU(True),
            nn.Conv2d(o, o, 3, padding=1),
            nn.BatchNorm2d(o),
            nn.ReLU(True),
        )

    def forward(self, x):
        return self.d(x)


class Down(nn.Module):
    def __init__(self, i, o):
        super().__init__()
        self.m = nn.Sequential(nn.MaxPool2d(2), DoubleConv(i, o))

    def forward(self, x):
        return self.m(x)


class UNetEncoder(nn.Module):
    def __init__(self, i=3, b=64):
        super().__init__()
        self.inc = DoubleConv(i, b)
        self.d1 = Down(b, b * 2)
        self.d2 = Down(b * 2, b * 4)
        self.d3 = Down(b * 4, b * 8)
        self.d4 = Down(b * 8, b * 16)
        self.out = b * 16

    def forward(self, x):
        return self.d4(self.d3(self.d2(self.d1(self.inc(x)))))


class DualBranchFiberNet(nn.Module):
    def __init__(self, nm, bt, dr=0.4):
        super().__init__()
        self.num_modes = nm
        self.backbone_type = bt
        if bt == "unet":
            self.backbone = UNetEncoder(3, 64)
            fc = self.backbone.out
        else:
            self.backbone = timm.create_model(
                BACKBONE_NAME_MAP[bt], pretrained=False, num_classes=0, global_pool=""
            )
        with torch.no_grad():
            d = torch.zeros(1, 3, IMG_SIZE, IMG_SIZE)
            fm = self.backbone(d)
            fc = fm.shape[1]
            fs = fm.shape[2] * fm.shape[3]
        self.cbam = CBAM(fc)
        self.dropout = nn.Dropout(dr)
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.weight_head = nn.Sequential(
            nn.Linear(fc, 512),
            nn.ReLU(True),
            nn.Dropout(dr),
            nn.Linear(512, nm),
        )
        self.phase_compress_conv = nn.Sequential(
            nn.Conv2d(fc, 64, 1),
            nn.BatchNorm2d(64),
            nn.ReLU(True),
        )
        fd = 64 * fs
        self.phase_head = nn.Sequential(
            nn.Linear(fd, 512),
            nn.ReLU(True),
            nn.Dropout(dr),
            nn.Linear(512, 2 * (nm - 1)),
        )

    def forward(self, x):
        fm = self.cbam(self.backbone(x))
        w = F.normalize(torch.relu(self.weight_head(torch.flatten(self.gap(fm), 1))), p=2, dim=1)
        pv = self.phase_head(torch.flatten(self.phase_compress_conv(fm), 1)).view(-1, self.num_modes - 1, 2)
        nv = F.normalize(pv, p=2, dim=-1)
        rc = torch.ones(x.shape[0], 1, device=x.device)
        rs = torch.zeros(x.shape[0], 1, device=x.device)
        fc = torch.cat([rc, nv[:, :, 0]], 1)
        fs = torch.cat([rs, nv[:, :, 1]], 1)
        with torch.no_grad():
            fr = torch.atan2(fs, fc)
        return w, fc, fs, fr


def extract_state_dict(checkpoint):
    if not isinstance(checkpoint, dict):
        raise TypeError("模型检查点格式不正确：应为参数字典。")
    for key in ("model_state_dict", "state_dict"):
        state_dict = checkpoint.get(key)
        if isinstance(state_dict, dict):
            break
    else:
        state_dict = checkpoint
    if state_dict and all(key.startswith("module.") for key in state_dict):
        state_dict = {key.removeprefix("module."): value for key, value in state_dict.items()}
    return state_dict


def infer_num_modes(state_dict):
    weight_keys = [key for key in state_dict if key.endswith("weight_head.3.weight")]
    if len(weight_keys) != 1:
        raise KeyError("无法从模型权重中唯一定位 weight_head.3.weight。")
    num_modes = int(state_dict[weight_keys[0]].shape[0])
    if num_modes < 2:
        raise ValueError(f"从模型中识别到的模式数无效: {num_modes}")
    phase_keys = [key for key in state_dict if key.endswith("phase_head.3.weight")]
    if len(phase_keys) == 1:
        phase_outputs = int(state_dict[phase_keys[0]].shape[0])
        if phase_outputs != 2 * (num_modes - 1):
            raise ValueError(
                "模型权重与相位输出层不一致："
                f"权重分支对应 {num_modes} 个模式，相位分支输出 {phase_outputs} 维"
                f"（应为 {2 * (num_modes - 1)} 维）。"
            )
    return num_modes


def heuristic_backbone_keys(state_dict):
    keys = list(state_dict.keys())
    if any(k.startswith("backbone.inc.") for k in keys):
        return ["unet"]
    if any(k.startswith("backbone.blocks.") for k in keys):
        if any(k.startswith("backbone.conv_stem.") for k in keys):
            return ["efficientnet_b0", "mobilenetv4_medium", "mobilenetv4_small"]
        return ["mobilenetv3_small", "mobilenetv3_large"]
    if any(k.startswith("backbone.features.") for k in keys):
        return ["vgg16", "mobilenetv3_small", "mobilenetv3_large", "mobilenetv4_small", "mobilenetv4_medium"]
    if any(k.startswith("backbone.conv1.") or k.startswith("backbone.layer1.") for k in keys):
        return ["resnet152"]
    return []


def detect_backbone(state_dict, num_modes):
    candidates = heuristic_backbone_keys(state_dict)
    for candidate in candidates + [item for item in SUPPORTED_BACKBONES if item not in candidates]:
        try:
            model = DualBranchFiberNet(num_modes, candidate)
            model.load_state_dict(state_dict, strict=True)
            return candidate
        except Exception:
            continue
    raise RuntimeError("无法识别模型骨干网络（支持的骨干见 BACKBONE_NAME_MAP）。")


def load_mode_labels(model_path, num_modes):
    labels_path = Path(model_path).parent / "labels.csv"
    if labels_path.is_file():
        with labels_path.open("r", newline="", encoding="utf-8-sig") as file:
            header = next(csv.reader(file), [])
        mode_labels = [
            column.removesuffix("_weight")
            for column in header
            if column.endswith("_weight")
        ]
        valid_labels = [label for label in mode_labels if f"{label}_phase" in header]
        if len(valid_labels) == num_modes:
            return valid_labels
    return [f"mode_{index:02d}" for index in range(1, num_modes + 1)]


def load_state(model_path):
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    state_dict = extract_state_dict(checkpoint)
    num_modes = infer_num_modes(state_dict)
    backbone = detect_backbone(state_dict, num_modes)
    return state_dict, num_modes, backbone


def build_model(state_dict, num_modes, backbone, device):
    model = DualBranchFiberNet(num_modes, backbone).to(device)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def scan_files(files):
    results = []
    for file_path in files:
        entry = {"path": file_path}
        try:
            state_dict, num_modes, backbone = load_state(file_path)
            entry.update(
                {
                    "ok": True,
                    "numModes": num_modes,
                    "backbone": backbone,
                    "modeLabels": load_mode_labels(file_path, num_modes),
                }
            )
        except Exception as error:
            entry.update({"ok": False, "error": str(error)})
        results.append(entry)
    return {"ok": True, "results": results}


def predict(job):
    model_path = Path(job["modelPath"])
    if not model_path.is_file():
        raise FileNotFoundError(f"模型文件不存在: {model_path}")
    size = int(job.get("size", IMG_SIZE))
    near_flat = job["near"]
    far_flat = job["far"]
    device_name = "cpu" if job.get("device") == "cpu" else ("cuda" if torch.cuda.is_available() else "cpu")

    started = time.time()
    state_dict, num_modes, backbone = load_state(model_path)
    device = torch.device(device_name)
    model = build_model(state_dict, num_modes, backbone, device)

    near_arr = np.asarray(near_flat, dtype=np.uint8).reshape(size, size)
    far_arr = np.asarray(far_flat, dtype=np.uint8).reshape(size, size)
    zero_arr = np.zeros_like(near_arr)
    combined = Image.fromarray(np.stack([near_arr, far_arr, zero_arr], axis=-1))
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    image = transform(combined).unsqueeze(0).to(device)

    with torch.inference_mode():
        pred_weights, _, _, pred_phases = model(image)
    elapsed_ms = (time.time() - started) * 1000

    return {
        "ok": True,
        "numModes": num_modes,
        "backbone": backbone,
        "modeLabels": load_mode_labels(model_path, num_modes),
        "weights": [float(value) for value in pred_weights[0].cpu().numpy()],
        "phases": [float(value) for value in pred_phases[0].cpu().numpy()],
        "device": device_name,
        "elapsedMs": round(elapsed_ms, 1),
    }


def _adaptive_crop_ratio(intensity, energy_fraction, padding_factor):
    image = np.asarray(intensity, dtype=np.float64)
    height, width = image.shape
    total = float(image.sum())
    if not np.isfinite(total) or total <= 0:
        return 0.3

    x_axis = np.arange(width, dtype=np.float64)
    y_axis = np.arange(height, dtype=np.float64)
    column_energy = image.sum(axis=0)
    row_energy = image.sum(axis=1)
    center_x = int(np.rint(np.dot(x_axis, column_energy) / total))
    center_y = int(np.rint(np.dot(y_axis, row_energy) / total))
    center_x = max(0, min(width - 1, center_x))
    center_y = max(0, min(height - 1, center_y))

    dx2 = np.square(np.arange(width, dtype=np.int32) - center_x)
    dy2 = np.square(np.arange(height, dtype=np.int32) - center_y)
    distance_squared = dy2[:, None] + dx2[None, :]
    radial_energy = np.bincount(distance_squared.ravel(), weights=image.ravel())
    cumulative = np.cumsum(radial_energy)
    target_index = int(np.searchsorted(cumulative, total * energy_fraction, side="left"))
    energy_radius = max(1.0, float(np.sqrt(target_index)))
    half_size = max(2, int(np.ceil(energy_radius * padding_factor)))
    boundary = min(center_x, width - 1 - center_x, center_y, height - 1 - center_y)
    half_size = max(2, min(boundary, half_size))
    return float((2 * half_size) / max(width, height))


def _build_calibration_basis(fiber, modes, grid_size):
    core_radius = float(fiber["coreRadius"])
    zone_size = float(fiber["zoneSize"])
    half_zone = zone_size / 2
    x = np.linspace(-half_zone, half_zone, grid_size, dtype=np.float64)
    y = np.linspace(half_zone, -half_zone, grid_size, dtype=np.float64)
    xx, yy = np.meshgrid(x, y)
    radius = np.sqrt(xx * xx + yy * yy)
    rho = radius / core_radius
    angle = np.arctan2(yy, xx)
    inside = rho <= 1
    basis = []

    for mode_index, mode in enumerate(modes):
        order = int(mode["l"])
        u_value = float(mode["u"])
        w_value = float(mode["w"])
        boundary_j = special.jv(order, u_value)
        boundary_k = special.kv(order, w_value)
        radial = np.empty_like(rho)
        radial[inside] = special.jv(order, u_value * rho[inside])
        with np.errstate(over="ignore", under="ignore", invalid="ignore", divide="ignore"):
            radial[~inside] = boundary_j * special.kv(order, w_value * rho[~inside]) / boundary_k
        angular = np.cos(order * angle) if mode.get("parity", "e") == "e" else np.sin(order * angle)
        values = np.nan_to_num(radial * angular, nan=0.0, posinf=0.0, neginf=0.0)
        norm = float(np.sqrt(np.sum(values * values))) or 1.0
        basis.append((values / norm).astype(np.float32))
        emit_progress(
            "basis",
            2 + 8 * (mode_index + 1) / len(modes),
            f"正在构建模式基函数 {mode_index + 1}/{len(modes)}",
            completedModes=mode_index + 1,
            totalModes=len(modes),
            completedSamples=0,
            totalSamples=50,
            estimatedRemainingMs=None,
        )

    return np.stack(basis, axis=0)


def calibrate_fiber_profile(job):
    fiber = job["fiber"]
    modes = job["modes"]
    settings = job.get("calibration", {})
    sample_count = int(settings.get("samples", 50))
    if sample_count != 50:
        raise ValueError("自定义光纤组合固定使用 50 组光斑进行裁剪校准。")
    if not modes:
        raise ValueError("当前光纤参数没有可校准的模式。")
    if len(modes) > 200:
        raise ValueError("模式数量超过 200，无法在网页校准流程中安全处理。")

    grid_size = int(settings.get("gridSize", 600))
    fft_ratio = int(settings.get("fftRatio", 4))
    energy_fraction = float(settings.get("energyFraction", 0.95))
    padding_factor = float(settings.get("paddingFactor", 1.12))
    percentile = float(settings.get("percentile", 95))
    safety = float(settings.get("safety", 1.10))
    seed = int(settings.get("seed", 20260713))
    if grid_size < 128 or grid_size > 600:
        raise ValueError("校准网格必须在 128 到 600 之间。")
    if fft_ratio < 1 or fft_ratio > 4:
        raise ValueError("FFT 比例必须在 1 到 4 之间。")

    started = time.time()
    emit_progress("preparing", 1, "正在准备光纤网格与模式参数", completedSamples=0, totalSamples=sample_count, estimatedRemainingMs=None)
    basis = _build_calibration_basis(fiber, modes, grid_size)
    window = np.outer(np.hanning(grid_size), np.hanning(grid_size)).astype(np.float32)
    fft_size = grid_size * fft_ratio
    padding = (fft_size - grid_size) // 2
    generator = np.random.Generator(np.random.MT19937(seed))
    near_ratios = []
    far_ratios = []
    sampling_started = time.time()

    for sample_index in range(sample_count):
        raw_weights = 0.45 + 0.55 * generator.random(len(modes))
        weights = raw_weights / np.linalg.norm(raw_weights)
        phases = -np.pi + 2 * np.pi * generator.random(len(modes))
        coefficients = (weights * np.exp(1j * phases)).astype(np.complex64)
        # Avoid NumPy's BLAS-backed tensordot here.  In the Windows inference
        # environment it can collide with the native runtimes loaded by Torch
        # and terminate the worker before Python can report an exception.
        # Elementwise accumulation is mathematically identical for this axis
        # contraction and keeps calibration progress/reporting reliable.
        field = np.sum(coefficients[:, None, None] * basis, axis=0)
        near_intensity = np.abs(field) ** 2
        near_ratios.append(_adaptive_crop_ratio(near_intensity, energy_fraction, padding_factor))

        padded = np.zeros((fft_size, fft_size), dtype=np.complex64)
        padded[padding:padding + grid_size, padding:padding + grid_size] = field * window
        far_field = scipy_fft.fftshift(
            scipy_fft.fft2(scipy_fft.ifftshift(padded), workers=-1)
        )
        far_intensity = np.abs(far_field) ** 2
        far_ratios.append(_adaptive_crop_ratio(far_intensity, energy_fraction, padding_factor))
        completed = sample_index + 1
        sample_elapsed_ms = (time.time() - sampling_started) * 1000
        estimated_remaining_ms = sample_elapsed_ms / completed * (sample_count - completed)
        emit_progress(
            "sampling",
            10 + 88 * completed / sample_count,
            f"已完成 {completed}/{sample_count} 组近场与远场光斑",
            completedSamples=completed,
            totalSamples=sample_count,
            elapsedMs=round((time.time() - started) * 1000, 1),
            estimatedRemainingMs=round(estimated_remaining_ms, 1),
        )

    emit_progress("finalizing", 99, "正在汇总 P95 与统一裁剪参数", completedSamples=sample_count, totalSamples=sample_count, estimatedRemainingMs=0)
    near_percentile = float(np.percentile(near_ratios, percentile, method="linear"))
    far_percentile = float(np.percentile(far_ratios, percentile, method="linear"))
    near_half_ratio = min(0.5, near_percentile * safety / 2)
    far_half_ratio = min(0.5, far_percentile * safety / 2)
    near_crop_pixels = max(4, 2 * int(np.floor(grid_size * near_half_ratio)))
    far_crop_pixels = max(4, 2 * int(np.floor(fft_size * far_half_ratio)))

    return {
        "ok": True,
        "samples": sample_count,
        "percentile": percentile,
        "safety": safety,
        "seed": seed,
        "randomEngine": "numpy-mt19937",
        "weightRange": [0.45, 1.0],
        "phaseRange": [-float(np.pi), float(np.pi)],
        "energyFraction": energy_fraction,
        "paddingFactor": padding_factor,
        "gridSize": grid_size,
        "fftRatio": fft_ratio,
        "fftSize": fft_size,
        "nearSampleFullWidthRatios": [round(value, 10) for value in near_ratios],
        "farSampleFullWidthRatios": [round(value, 10) for value in far_ratios],
        "nearPercentileFullWidthRatio": near_percentile,
        "farPercentileFullWidthRatio": far_percentile,
        "nearfieldCropRatio": near_half_ratio,
        "farfieldCropRatio": far_half_ratio,
        "nearCropPixels": near_crop_pixels,
        "farCropPixels": far_crop_pixels,
        "nearViewMagnification": grid_size / near_crop_pixels,
        "farViewMagnification": fft_size / far_crop_pixels,
        "elapsedMs": round((time.time() - started) * 1000, 1),
    }


def main():
    raw = sys.stdin.buffer.read().decode("utf-8")
    try:
        job = json.loads(raw)
        mode = job.get("mode", "predict")
        if mode == "scan":
            result = scan_files(job.get("files", []))
        elif mode == "predict":
            result = predict(job)
        elif mode == "calibrate":
            result = calibrate_fiber_profile(job)
        else:
            result = {"ok": False, "error": f"未知任务类型: {mode}"}
    except Exception as error:
        result = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
