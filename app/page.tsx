"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FiberPanel from "./components/FiberPanel";
import ModePanel from "./components/ModePanel";
import ModeSelectorDialog from "./components/ModeSelectorDialog";
import NormalizationPanel from "./components/NormalizationPanel";
import SettingsDialog from "./components/SettingsDialog";
import SimulationPanel from "./components/SimulationPanel";
import { calculateV, type CropInfo, type DisplaySettings, type FiberParams, type ModeSetting } from "./lpPhysics";
import { requestSimulation, requestSupportedModes } from "./services/simulationApi";

const INITIAL_FIBER: FiberParams = { coreRadius: 10, na: 0.179, wavelength: 0.6328, zoneSize: 100, maxL: 10, maxM: 10 };
const DEFAULT_DISPLAY: DisplaySettings = { autoCrop: true, energyFraction: 0.95, paddingFactor: 1.12, gamma: 0.7, gridSize: 600, outputSize: 224 };

function drawPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, size: number) {
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
}

export default function Home() {
  const [fiber, setFiber] = useState(INITIAL_FIBER);
  const [detectedFiber, setDetectedFiber] = useState(INITIAL_FIBER);
  const [modes, setModes] = useState<ModeSetting[]>([]);
  const [isNormalized, setIsNormalized] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("请先确认光纤参数并检测支持模式");
  const [totalPower, setTotalPower] = useState(0);
  const [display, setDisplay] = useState(DEFAULT_DISPLAY);
  const [crop, setCrop] = useState<CropInfo | null>(null);
  const [farCrop, setFarCrop] = useState<CropInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);
  const nearCanvasRef = useRef<HTMLCanvasElement>(null);
  const farCanvasRef = useRef<HTMLCanvasElement>(null);

  const activeModes = useMemo(() => modes.filter((mode) => mode.enabled), [modes]);
  const modeFamilyCount = useMemo(() => new Set(modes.map((mode) => `${mode.l}:${mode.m}`)).size, [modes]);
  const weightNorm = useMemo(() => Math.sqrt(activeModes.reduce((sum, mode) => sum + mode.weight * mode.weight, 0)), [activeModes]);
  const fiberChanged = useMemo(() => JSON.stringify(fiber) !== JSON.stringify(detectedFiber), [fiber, detectedFiber]);
  const vNumber = useMemo(() => calculateV(fiber), [fiber]);
  const currentStep = fiberChanged || !modes.length ? 1 : !isNormalized ? 3 : 4;

  useEffect(() => {
    const canvases = [nearCanvasRef.current, farCanvasRef.current];
    const size = display.outputSize;
    canvases.forEach((canvas) => { const ctx = canvas?.getContext("2d"); if (!ctx) return; const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gradient.addColorStop(0, "#14253d"); gradient.addColorStop(0.45, "#091421"); gradient.addColorStop(1, "#040a10"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size); });
  }, [display.outputSize]);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "lp-simulator-ready" }, "*");
    }
  }, []);

  function updateFiber<K extends keyof FiberParams>(key: K, value: FiberParams[K]) {
    setFiber((current) => ({ ...current, [key]: value }));
    setModes([]); setIsNormalized(false); setIsSimulated(false); setCrop(null); setFarCrop(null);
    setMessage("光纤参数已改变，请重新检测支持模式");
  }

  async function detectModes() {
    setIsBusy(true); setMessage("后端正在求解 LP 模式特征方程…");
    try {
      const result = await requestSupportedModes(fiber);
      const initialWeight = result.modes.length ? 1 / Math.sqrt(result.modes.length) : 0;
      setModes(result.modes.map((mode) => ({ ...mode, enabled: true, weight: initialWeight, phase: 0 })));
      setDetectedFiber({ ...fiber }); setIsNormalized(result.modes.length > 0); setIsSimulated(false);
      const familyCount = new Set(result.modes.map((mode) => `${mode.l}:${mode.m}`)).size;
      setMessage(result.modes.length ? `支持 ${result.modes.length} 个空间模式分量（${familyCount} 个 LP 模式族），初始权重已归一化` : "当前 V 数下未检测到模式，请检查参数范围");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模式检测失败");
    } finally {
      setIsBusy(false);
    }
  }

  function updateMode(id: string, patch: Partial<ModeSetting>) {
    setModes((current) => current.map((mode) => mode.id === id ? { ...mode, ...patch } : mode));
    setIsNormalized(false); setIsSimulated(false);
  }

  function toggleModeSelection(id: string) {
    const mode = modes.find((item) => item.id === id);
    if (mode) updateMode(id, { enabled: !mode.enabled });
  }

  function randomizeModes() {
    setModes((current) => current.map((mode) => ({ ...mode, weight: mode.enabled ? 0.45 + Math.random() * 0.55 : mode.weight, phase: mode.enabled ? -Math.PI + Math.random() * 2 * Math.PI : mode.phase })));
    setIsNormalized(false); setIsSimulated(false); setMessage("已生成随机模态参数，请执行归一化");
  }

  function setAllModesEnabled(enabled: boolean) {
    setModes((current) => current.map((mode) => ({ ...mode, enabled })));
    setIsNormalized(false); setIsSimulated(false);
    setMessage(enabled ? "已开启全部模式，请执行归一化" : "已关闭全部模式；请至少开启一个模式后再归一化");
  }

  function normalizeWeights() {
    if (!activeModes.length || weightNorm === 0) { setMessage("请至少启用一个权重非零的模式"); return; }
    setModes((current) => current.map((mode) => mode.enabled ? { ...mode, weight: mode.weight / weightNorm } : mode));
    setIsNormalized(true); setIsSimulated(false); setMessage("归一化完成：Σw² = 1.000000");
  }

  async function simulate() {
    if (fiberChanged) { setMessage("光纤参数已改变，请重新检测支持模式"); return; }
    if (!isNormalized) { setMessage("请先完成权重归一化"); return; }
    if (!activeModes.length) { setMessage("请至少启用一个模式"); return; }
    setIsBusy(true); setMessage("后端正在相干叠加模式并计算单张光斑…");
    try {
      const result = await requestSimulation(fiber, modes, display);
      if (nearCanvasRef.current) drawPixels(nearCanvasRef.current, result.pixels, display.outputSize);
      if (farCanvasRef.current) drawPixels(farCanvasRef.current, result.farPixels, display.outputSize);
      setTotalPower(result.totalPower); setCrop(result.crop); setFarCrop(result.farCrop); setIsSimulated(true);
      setMessage(display.autoCrop ? `仿真完成：近场与远场均按 ${(display.energyFraction * 100).toFixed(1)}% 能量自适应裁剪` : "仿真完成：已输出完整近场与远场视场");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "光斑仿真失败");
    } finally {
      setIsBusy(false);
    }
  }

  function downloadSpot(plane: "near" | "far") {
    const canvas = plane === "near" ? nearCanvasRef.current : farCanvasRef.current;
    if (!canvas || !isSimulated) return;
    const link = document.createElement("a"); link.download = `LP_${plane === "near" ? "nearfield" : "farfield"}_V${calculateV(fiber).toFixed(3)}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  }

  function updateDisplay(patch: Partial<DisplaySettings>) {
    setDisplay((current) => ({ ...current, ...patch }));
    setIsSimulated(false); setCrop(null); setFarCrop(null); setMessage("仿真设置已改变，请重新开始仿真");
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><span className="brand-core"/></div><div><p className="eyebrow">FIBER MODE LAB · FRONTEND / API / PHYSICS</p><h1>少模光纤单光斑仿真器</h1></div><div className="topbar-actions"><button className="settings-button" onClick={() => setSettingsOpen(true)}><span>⚙</span> 仿真设置</button><div className="header-status"><span className="status-dot"/>前后端分离计算</div></div></header>
    <section className="workflow" aria-label="仿真流程">{["光纤参数", "模态参数", "归一化", "光斑仿真"].map((label, index) => <div className={`workflow-step ${currentStep >= index + 1 ? "active" : ""}`} key={label}><span>{index + 1}</span><strong>{label}</strong></div>)}</section>
    <div className="workspace-grid">
      <aside className="left-column"><FiberPanel fiber={fiber} vNumber={vNumber} detected={modes.length > 0 && !fiberChanged} supportedCount={modes.length} familyCount={modeFamilyCount} busy={isBusy} onChange={updateFiber} onDetect={detectModes}/><NormalizationPanel norm={weightNorm} normalized={isNormalized && modes.length > 0} disabled={!modes.length || isBusy} onNormalize={normalizeWeights}/></aside>
      <ModePanel modes={modes} busy={isBusy} onUpdate={updateMode} onRandom={randomizeModes} onOpenSelector={() => setModeSelectorOpen(true)}/>
      <aside className="right-column"><SimulationPanel nearCanvasRef={nearCanvasRef} farCanvasRef={farCanvasRef} simulated={isSimulated} busy={isBusy} hasModes={modes.length > 0} totalPower={totalPower} display={display} nearCrop={crop} farCrop={farCrop} onSimulate={simulate} onDownloadNear={() => downloadSpot("near")} onDownloadFar={() => downloadSpot("far")}/><section className="status-card" aria-live="polite"><span className={`status-indicator ${isBusy ? "busy" : ""}`}/><div><strong>计算状态</strong><p>{message}</p></div></section></aside>
    </div>
    <footer className="app-footer"><span>模型：弱导近似 · 阶跃型光纤 · 贝塞尔函数特征方程</span><span>参考 generate_dataset_matlab.m</span></footer>
    <SettingsDialog open={settingsOpen} settings={display} onChange={updateDisplay} onReset={() => updateDisplay(DEFAULT_DISPLAY)} onClose={() => setSettingsOpen(false)}/>
    <ModeSelectorDialog open={modeSelectorOpen} modes={modes} busy={isBusy} onToggle={toggleModeSelection} onSetAll={setAllModesEnabled} onClose={() => setModeSelectorOpen(false)}/>
  </main>;
}
