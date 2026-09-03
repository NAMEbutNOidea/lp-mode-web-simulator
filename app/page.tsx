"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FiberPanel from "./components/FiberPanel";
import FiberProfilePanel from "./components/FiberProfilePanel";
import ModePanel from "./components/ModePanel";
import ModeSelectorDialog from "./components/ModeSelectorDialog";
import SettingsDialog from "./components/SettingsDialog";
import SimulationPanel from "./components/SimulationPanel";
import ModelAgentPanel from "./components/ModelAgentPanel";
import PredictionPanel from "./components/PredictionDialog";
import { calculateV, type CropInfo, type DisplaySettings, type FiberParams, type ModeSetting } from "./lpPhysics";
import { requestSimulation, requestSupportedModes } from "./services/simulationApi";
import { requestPrediction, type ModelInfo, type PredictionPayload } from "./services/predictionApi";
import type { FiberProfile } from "./services/fiberProfilesApi";

const INITIAL_FIBER: FiberParams = { coreRadius: 10, na: 0.179, wavelength: 0.6328, zoneSize: 100, maxL: 10, maxM: 10 };
const DEFAULT_DISPLAY: DisplaySettings = { autoCrop: true, cropMode: "adaptive", nearfieldCropRatio: null, farfieldCropRatio: null, energyFraction: 0.95, paddingFactor: 1.12, gamma: 0.7, gridSize: 600, fftRatio: 4, outputSize: 224 };

function drawPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, size: number) {
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
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
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [prediction, setPrediction] = useState<PredictionPayload | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const nearCanvasRef = useRef<HTMLCanvasElement>(null);
  const farCanvasRef = useRef<HTMLCanvasElement>(null);

  const activeModes = useMemo(() => modes.filter((mode) => mode.enabled), [modes]);
  const modeFamilyCount = useMemo(() => new Set(modes.map((mode) => `${mode.l}:${mode.m}`)).size, [modes]);
  const weightNorm = useMemo(() => Math.sqrt(activeModes.reduce((sum, mode) => sum + mode.weight * mode.weight, 0)), [activeModes]);
  const fiberChanged = useMemo(() => JSON.stringify(fiber) !== JSON.stringify(detectedFiber), [fiber, detectedFiber]);
  const vNumber = useMemo(() => calculateV(fiber), [fiber]);
  const modeCountMatches = selectedModel?.numModes == null || activeModes.length === selectedModel.numModes;
  const currentStep = fiberChanged || !modes.length ? 1 : !isNormalized ? 2 : 3;
  const predictionStepActive = Boolean(selectedModel);
  const visualizationStepActive = Boolean(prediction);

  useEffect(() => {
    const canvases = [nearCanvasRef.current, farCanvasRef.current];
    const size = display.outputSize;
    canvases.forEach((canvas) => {
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#040a10";
      ctx.fillRect(0, 0, size, size);
    });
  }, [display.outputSize]);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "lp-simulator-ready" }, "*");
    }
  }, []);

  function updateFiber<K extends keyof FiberParams>(key: K, value: FiberParams[K]) {
    setFiber((current) => ({ ...current, [key]: value }));
    setModes([]); setIsNormalized(false); setIsSimulated(false); setCrop(null); setFarCrop(null); setPrediction(null);
    setMessage("光纤参数已改变，请重新检测支持模式");
  }

  function applyFiberProfile(profile: FiberProfile) {
    const initialWeight = profile.modes.length ? 1 / Math.sqrt(profile.modes.length) : 0;
    setFiber({ ...profile.fiber });
    setDetectedFiber({ ...profile.fiber });
    setModes(profile.modes.map((mode) => ({ ...mode, enabled: true, weight: initialWeight, phase: 0 })));
    setDisplay({ ...DEFAULT_DISPLAY, ...profile.display, cropMode: "fixed", autoCrop: true });
    setIsNormalized(profile.modes.length > 0);
    setIsSimulated(false);
    setCrop(null);
    setFarCrop(null);
    setPrediction(null);
    setMessage(`已载入组合“${profile.name}”：${profile.modeCount} 个模式，并启用 50 组光斑预校准的固定裁剪参数`);
  }

  async function detectModes() {
    setIsBusy(true); setMessage("后端正在求解 LP 模式特征方程…");
    try {
      const result = await requestSupportedModes(fiber);
      const initialWeight = result.modes.length ? 1 / Math.sqrt(result.modes.length) : 0;
      setModes(result.modes.map((mode) => ({ ...mode, enabled: true, weight: initialWeight, phase: 0 })));
      setDetectedFiber({ ...fiber }); setIsNormalized(result.modes.length > 0); setIsSimulated(false);
      setPrediction(null);
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
    setIsNormalized(false); setIsSimulated(false); setPrediction(null);
  }

  function toggleModeSelection(id: string) {
    const mode = modes.find((item) => item.id === id);
    if (mode) updateMode(id, { enabled: !mode.enabled });
  }

  function randomizeModes() {
    setModes((current) => current.map((mode) => ({ ...mode, weight: mode.enabled ? 0.45 + Math.random() * 0.55 : mode.weight, phase: mode.enabled ? -Math.PI + Math.random() * 2 * Math.PI : mode.phase })));
    setIsNormalized(false); setIsSimulated(false); setPrediction(null); setMessage("已生成随机模态参数，请执行归一化");
  }

  function setAllModesEnabled(enabled: boolean) {
    setModes((current) => current.map((mode) => ({ ...mode, enabled })));
    setIsNormalized(false); setIsSimulated(false); setPrediction(null);
    setMessage(enabled ? "已开启全部模式，请执行归一化" : "已关闭全部模式；请至少开启一个模式后再归一化");
  }

  function normalizeWeights() {
    if (!activeModes.length || weightNorm === 0) { setMessage("请至少启用一个权重非零的模式"); return; }
    setModes((current) => current.map((mode) => mode.enabled ? { ...mode, weight: mode.weight / weightNorm } : mode));
    setIsNormalized(true); setIsSimulated(false); setPrediction(null); setMessage("归一化完成：Σw² = 1.000000");
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
      setTotalPower(result.totalPower); setCrop(result.crop); setFarCrop(result.farCrop); setIsSimulated(true); setPrediction(null);
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
    setIsSimulated(false); setCrop(null); setFarCrop(null); setPrediction(null); setMessage("仿真设置已改变，请重新开始仿真");
  }

  async function predictModes() {
    if (!selectedModel) { setMessage("请先在右下角“模型”中选择训练好的分解模型"); return; }
    if (fiberChanged) { setMessage("光纤参数已改变，请重新检测支持模式"); return; }
    if (!isNormalized) { setMessage("请先完成权重归一化再预测"); return; }
    if (!isSimulated) { setMessage("请先点击“开始仿真”生成近场/远场光斑，再执行模态预测"); return; }
    if (selectedModel.numModes != null && activeModes.length !== selectedModel.numModes) {
      setMessage(`模型需要 ${selectedModel.numModes} 个模式，当前仿真启用 ${activeModes.length} 个。请调整光纤参数（如 NA / 纤芯半径）使检测模式数与模型一致后重新检测并仿真。`);
      return;
    }
    setPredicting(true); setMessage(`正在加载模型 ${selectedModel.name} 并预测模态系数…`);
    try {
      const result = await requestPrediction(fiber, modes, display, selectedModel.name);
      setPrediction(result);
      setMessage(`预测完成：${result.model.numModes} 个模态系数（${result.model.backbone} / ${result.model.device}，推理 ${(result.model.elapsedMs / 1000).toFixed(2)}s），分析结果已显示在页面下方`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模态预测失败");
    } finally {
      setPredicting(false);
    }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><span className="brand-core"/></div><div><p className="eyebrow">FIBER MODE LAB · FRONTEND / API / PHYSICS</p><h1>少模光纤单光斑仿真器</h1></div><div className="topbar-actions"><button className="settings-button" onClick={() => setSettingsOpen(true)}><span>⚙</span> 仿真设置</button><div className="header-status"><span className="status-dot"/>前后端分离计算</div></div></header>
        <section className="workflow" aria-label="仿真与预测流程">
      <div className="workflow-row">{["光纤参数与组合", "模态参数与归一化", "光斑仿真"].map((label, index) => <div className={`workflow-step ${currentStep >= index + 1 ? "active" : ""}`} key={label}><span>{index + 1}</span><strong>{label}</strong></div>)}</div>
      <div className="workflow-row">{["预测参数", "可视化误差"].map((label, index) => { const step = index + 4; const active = step === 4 ? predictionStepActive : visualizationStepActive; return <div className={`workflow-step ${active ? "active" : ""}`} key={label}><span>{step}</span><strong>{label}</strong></div>; })}</div>
    </section>
    <div className="workspace-grid">
      <aside className="left-column"><section className="panel fiber-combined-panel" aria-label="光纤参数与自定义光纤组合"><FiberPanel fiber={fiber} vNumber={vNumber} detected={modes.length > 0 && !fiberChanged} supportedCount={modes.length} familyCount={modeFamilyCount} busy={isBusy || profileBusy} onChange={updateFiber} onDetect={detectModes}/><FiberProfilePanel fiber={fiber} display={display} disabled={isBusy || predicting} onApply={applyFiberProfile} onStatus={setMessage} onBusyChange={setProfileBusy}/></section></aside>
      <ModePanel modes={modes} busy={isBusy || profileBusy} normalized={isNormalized && modes.length > 0} norm={weightNorm} onUpdate={updateMode} onRandom={randomizeModes} onOpenSelector={() => setModeSelectorOpen(true)} onNormalize={normalizeWeights}/>
      <aside className="right-column"><SimulationPanel nearCanvasRef={nearCanvasRef} farCanvasRef={farCanvasRef} simulated={isSimulated} busy={isBusy || profileBusy || predicting} hasModes={modes.length > 0} totalPower={totalPower} display={display} nearCrop={crop} farCrop={farCrop} onSimulate={simulate} onDownloadNear={() => downloadSpot("near")} onDownloadFar={() => downloadSpot("far")} onPredict={predictModes} canPredict={isSimulated && Boolean(selectedModel) && !isBusy && !profileBusy && !predicting && modeCountMatches} modelSelected={Boolean(selectedModel)} predicting={predicting} modeCountMatches={modeCountMatches} modelNumModes={selectedModel?.numModes ?? null} simModeCount={activeModes.length}/><section className="status-card" aria-live="polite"><span className={`status-indicator ${isBusy || profileBusy || predicting ? "busy" : ""}`}/><div><strong>计算状态</strong><p>{message}</p></div></section></aside>
    </div>
    <PredictionPanel prediction={prediction} busy={predicting}/>
    <footer className="app-footer"><span>模型：弱导近似 · 阶跃型光纤 · 贝塞尔函数特征方程</span><span>参考 generate_dataset_matlab.m</span></footer>
    <SettingsDialog open={settingsOpen} settings={display} onChange={updateDisplay} onReset={() => updateDisplay(DEFAULT_DISPLAY)} onClose={() => setSettingsOpen(false)}/>
    <ModeSelectorDialog open={modeSelectorOpen} modes={modes} busy={isBusy} onToggle={toggleModeSelection} onSetAll={setAllModesEnabled} onClose={() => setModeSelectorOpen(false)}/>
    <ModelAgentPanel selected={selectedModel} onSelect={(model) => { setSelectedModel(model); setPrediction(null); setMessage(model.numModes != null && activeModes.length !== model.numModes ? `已选择模型：${model.name}（${model.numModes} 个模式）——与当前仿真 ${activeModes.length} 个模式不一致，请调整光纤参数` : `已选择模型：${model.name}（${model.numModes ?? "?"} 个模式）`); }} onStatus={(message) => setMessage(message)} simModeCount={activeModes.length}/>
  </main>;
}
