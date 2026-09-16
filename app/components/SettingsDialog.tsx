"use client";

import type { DisplaySettings } from "../lpPhysics";
import type { ReactNode } from "react";
import { Variable } from "./MathNotation";

export type UiTheme = "lab" | "toilet" | "kitty" | "ikun" | "sky";

const THEME_OPTIONS: Array<{ value: UiTheme; icon: string; label: string; hint: string }> = [
  { value: "lab", icon: "◉", label: "光学实验室", hint: "清爽、克制的科研界面" },
  { value: "toilet", icon: "💩", label: "厕所大便风", hint: "瓷砖、污渍棕与恶趣味高亮" },
  { value: "kitty", icon: "🎀", label: "Hello Kitty 可爱少女风", hint: "奶油粉、蝴蝶结与软糖圆角" },
  { value: "ikun", icon: "🐔🏀", label: "蔡徐坤·鸡你太美恶搞版", hint: "两年半 · 唱跳 RAP 篮球 · 背带裤" },
  { value: "sky", icon: "🫧", label: "淡蓝清新风", hint: "冰蓝渐变、通透面板与柔和高光" },
];

function SettingRange({ label, hint, value, min, max, step, suffix, disabled, onChange }: { label: ReactNode; hint: string; value: number; min: number; max: number; step: number; suffix: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className={`setting-row ${disabled ? "disabled" : ""}`}>
    <span><strong>{label}</strong><small>{hint}</small></span>
    <div className="setting-control"><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}/><div className="setting-value"><input type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}/><small>{suffix}</small></div></div>
  </label>;
}

export default function SettingsDialog({ open, settings, theme, onChange, onThemeChange, onReset, onClose }: { open: boolean; settings: DisplaySettings; theme: UiTheme; onChange: (patch: Partial<DisplaySettings>) => void; onThemeChange: (theme: UiTheme) => void; onReset: () => void; onClose: () => void }) {
  if (!open) return null;
  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><p className="section-kicker">界面主题 · 仿真参数 · 显示设置</p><h2 id="settings-title">仿真与显示设置</h2><p>切换界面风格，并集中控制自适应裁剪、显示映射和计算分辨率。</p></div><button className="close-button" aria-label="关闭设置" onClick={onClose}>×</button></header>
      <div className="settings-section theme-settings-section">
        <div className="settings-section-title"><span>00</span><div><strong>界面风格</strong><small>仅改变网页外观，不影响仿真与预测结果</small></div></div>
        <div className="theme-option-grid" role="radiogroup" aria-label="界面风格">
          {THEME_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} className={`theme-option ${theme === option.value ? "selected" : ""}`} onClick={() => onThemeChange(option.value)}>
            <span className="theme-option-icon" aria-hidden="true">{option.icon}</span><span><strong>{option.label}</strong><small>{option.hint}</small></span><i aria-hidden="true"/>
          </button>)}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title"><span>01</span><div><strong>{settings.cropMode === "fixed" ? "自定义组合固定裁剪" : "自适应能量裁剪"}</strong><small>{settings.cropMode === "fixed" ? "来自50组光斑的统一校准比例" : "对应 MATLAB crop_nearfield_adaptive"}</small></div><button className={`switch-control ${settings.autoCrop ? "on" : ""}`} role="switch" aria-checked={settings.autoCrop} onClick={() => onChange({ autoCrop: !settings.autoCrop })}><span/></button></div>
        {settings.cropMode === "fixed" && settings.autoCrop && <div className="fixed-crop-note"><span>近场半宽比例 <strong>{settings.nearfieldCropRatio?.toFixed(6)}</strong></span><span>远场半宽比例 <strong>{settings.farfieldCropRatio?.toFixed(6)}</strong></span><button type="button" onClick={() => onChange({ cropMode: "adaptive", nearfieldCropRatio: null, farfieldCropRatio: null })}>改用逐图自适应</button></div>}
        <SettingRange label="能量覆盖率" hint="以光强质心为中心，寻找覆盖目标能量的半径" value={Number((settings.energyFraction * 100).toFixed(1))} min={50} max={99.9} step={0.5} suffix="%" disabled={!settings.autoCrop} onChange={(value) => onChange({ energyFraction: value / 100 })}/>
        <SettingRange label="裁剪留白系数" hint="在能量半径外保留额外边缘，MATLAB 默认 1.12" value={settings.paddingFactor} min={1} max={2} step={0.01} suffix="×" disabled={!settings.autoCrop} onChange={(value) => onChange({ paddingFactor: value })}/>
      </div>
      <div className="settings-section">
        <div className="settings-section-title"><span>02</span><div><strong>显示映射</strong><small>只改变输出图像，不改变模式求解</small></div></div>
        <SettingRange label={<>伽马 <Variable name="γ"/></>} hint="小于 1 时增强较弱的光斑结构" value={settings.gamma} min={0.1} max={2} step={0.05} suffix="" onChange={(value) => onChange({ gamma: value })}/>
        <div className="select-grid">
          <label><span>内部计算网格</span><small>600 × 600 与参考 MATLAB 脚本一致</small><select value={settings.gridSize} onChange={(event) => onChange({ gridSize: Number(event.target.value) })}><option value="224">224 × 224（快速）</option><option value="320">320 × 320（平衡）</option><option value="600">600 × 600（MATLAB 一致）</option></select></label>
          <label><span>傅里叶变换零填充比例</span><small>远场校准与参考脚本默认使用 4×</small><select value={settings.fftRatio} onChange={(event) => onChange({ fftRatio: Number(event.target.value) })}><option value="1">1×（快速）</option><option value="2">2×</option><option value="4">4×（MATLAB 一致）</option></select></label>
          <label><span>输出图像尺寸</span><small>裁剪后重采样尺寸</small><select value={settings.outputSize} onChange={(event) => onChange({ outputSize: Number(event.target.value) })}><option value="128">128 × 128</option><option value="224">224 × 224</option><option value="256">256 × 256</option><option value="320">320 × 320</option></select></label>
        </div>
      </div>
      <footer className="settings-footer"><button className="reset-button" onClick={onReset}>恢复 MATLAB 默认设置</button><button className="settings-done-button" onClick={onClose}>完成设置</button></footer>
    </section>
  </div>;
}
