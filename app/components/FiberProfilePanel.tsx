"use client";

import { useEffect, useState } from "react";
import type { DisplaySettings, FiberParams } from "../lpPhysics";
import { requestFiberProfiles, saveFiberProfile, type FiberProfile, type FiberProfileJob } from "../services/fiberProfilesApi";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(milliseconds: number | null | undefined) {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return "计算中";
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

export default function FiberProfilePanel({ fiber, display, disabled, onApply, onStatus, onBusyChange, onConfigurePython, environmentRevision }: {
  onConfigurePython: () => void;
  environmentRevision: number;
  fiber: FiberParams;
  display: DisplaySettings;
  disabled: boolean;
  onApply: (profile: FiberProfile) => void;
  onStatus: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [profiles, setProfiles] = useState<FiberProfile[]>([]);
  const [profilesDir, setProfilesDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [progressJob, setProgressJob] = useState<FiberProfileJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestFiberProfiles()
      .then((result) => {
        if (cancelled) return;
        setProfiles(result.profiles);
        setProfilesDir(result.profilesDir);
        setError(result.errors.length ? `有 ${result.errors.length} 个组合文件无法读取` : null);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "读取组合失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [environmentRevision]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestFiberProfiles();
      setProfiles(result.profiles);
      setProfilesDir(result.profilesDir);
      if (result.errors.length) setError(`有 ${result.errors.length} 个组合文件无法读取`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取组合失败");
    } finally {
      setLoading(false);
    }
  }

  async function calibrateAndSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError("请先填写组合名称"); return; }
    setCalibrating(true);
    setProgressJob(null);
    onBusyChange(true);
    setError(null);
    onStatus("正在生成 50 组随机近场/远场光斑并预校准裁剪参数…");
    try {
      const result = await saveFiberProfile(trimmedName, fiber, display, setProgressJob);
      setProfiles((current) => [result.profile, ...current.filter((item) => item.id !== result.profile.id)]);
      setProfilesDir(result.profilesDir);
      setName("");
      onApply(result.profile);
      onStatus(`组合“${result.profile.name}”已保存：${result.profile.modeCount} 个模式，近/远场固定裁剪半宽比例 ${result.profile.calibration.nearfieldCropRatio.toFixed(6)} / ${result.profile.calibration.farfieldCropRatio.toFixed(6)}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "组合校准保存失败";
      setError(message);
      onStatus(message);
    } finally {
      setCalibrating(false);
      onBusyChange(false);
    }
  }

  return <section className="panel fiber-profile-panel">
    <div className="profile-heading">
      <div><p className="section-kicker">FIBER PRESETS</p><h2>自定义光纤组合</h2></div>
      <button type="button" className="agent-refresh" onClick={refresh} disabled={loading || calibrating} aria-label="刷新组合列表">↻</button>
    </div>
    <p className="panel-copy">保存前自动检测模式，并用 50 组随机光斑预校准统一裁剪比例。</p>
    <label className="profile-name-field"><span>组合名称</span><input value={name} maxLength={80} placeholder={`例如：${fiber.coreRadius.toFixed(1)}μm · NA ${fiber.na}`} onChange={(event) => setName(event.target.value)}/></label>
    <button type="button" className="primary-button full profile-save-button" onClick={calibrateAndSave} disabled={disabled || calibrating || !name.trim()}>{calibrating ? "正在校准 50 组光斑…" : "校准并保存当前组合"}</button>
    {(calibrating || progressJob?.status === "complete") && <div className={`profile-progress ${progressJob?.status === "complete" ? "complete" : ""}`}>
      <div className="profile-progress-title"><span><span className="agent-spark">✦</span>{progressJob?.message ?? "正在创建校准任务…"}</span><strong>{Math.round(progressJob?.progress ?? 0)}%</strong></div>
      <div className="profile-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressJob?.progress ?? 0)}><span style={{ width: `${progressJob?.progress ?? 0}%` }}/></div>
      <div className="profile-progress-meta"><span>光斑 {progressJob?.completedSamples ?? 0}/{progressJob?.totalSamples ?? 50}</span><span>已用 {formatDuration(progressJob?.elapsedMs)}</span><span>预计剩余 {formatDuration(progressJob?.estimatedRemainingMs)}</span></div>
    </div>}
    {error && <div className="profile-error" role="alert">{error}{/python|torch|timm|numpy|scipy|pillow/i.test(error) && <button type="button" className="python-environment-link" onClick={onConfigurePython}>选择 Python / conda 环境</button>}</div>}
    <div className="profile-list-heading"><strong>已保存组合</strong><span>{profiles.length}</span></div>
    {loading && <p className="profile-empty">正在读取组合…</p>}
    {!loading && profiles.length === 0 && <p className="profile-empty">尚未保存组合。</p>}
    {profiles.length > 0 && <div className="profile-list">
      {profiles.map((profile) => <button type="button" className="profile-item" key={profile.id} onClick={() => onApply(profile)} disabled={disabled || calibrating}>
        <span className="profile-item-title"><strong>{profile.name}</strong><em>{profile.modeCount} 模式</em></span>
        <span>a {profile.fiber.coreRadius.toFixed(2)} μm · NA {profile.fiber.na.toFixed(3)} · λ {(profile.fiber.wavelength * 1000).toFixed(1)} nm</span>
        <span>V {profile.vNumber.toFixed(4)} · {profile.familyCount} 个模式族</span>
        <span>裁剪半宽 {profile.calibration.nearfieldCropRatio.toFixed(5)} / {profile.calibration.farfieldCropRatio.toFixed(5)} · {formatDate(profile.createdAt)}</span>
      </button>)}
    </div>}
    {profilesDir && <p className="profile-directory" title={profilesDir}>保存目录：{profilesDir}</p>}
  </section>;
}
