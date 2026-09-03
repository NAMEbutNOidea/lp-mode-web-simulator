%% Pixel-level reference for the web simulator
clear; clc;

projectDir = string(fileparts(fileparts(mfilename('fullpath'))));
% Optional reference functions are supplied separately by the user.
funcDir = string(getenv("LP_MATLAB_REFERENCE_DIR"));
if strlength(funcDir) > 0
    addpath(funcDir);
end
requiredFunctions = ["compute_lpmodes", "synthesize_mode_field", ...
    "crop_nearfield_adaptive", "normalize_image"];
for functionName = requiredFunctions
    assert(exist(char(functionName), "file") == 2, ...
        "Missing reference function: %s. Set LP_MATLAB_REFERENCE_DIR or add the functions to the MATLAB path.", functionName);
end

cfg.fiber.coreRadius = 10.0e-6;
cfg.fiber.NA = 0.179;
cfg.fiber.lambda = 632.8e-9;
cfg.fiber.zoneSize = 100e-6;
cfg.fiber.maxL = 10;
cfg.fiber.maxM = 10;
cfg.sim.N = 600;
cfg.display.nearfieldEnergyFraction = 0.95;
cfg.display.nearfieldPaddingFactor = 1.12;
cfg.display.gamma = 0.7;

[modes, modeLabels] = compute_lpmodes(cfg);
numModes = numel(modes);
rawWeights = 0.45 + 0.55 * ((1:numModes) / (numModes + 1));
phases = -pi + 2*pi*((0:numModes-1) / numModes);

localCfg = cfg;
localCfg.coeff.weightType = 'amplitude';
localCfg.coeff.modeWeights = rawWeights;
localCfg.coeff.modePhases = phases;
field = synthesize_mode_field(modes, localCfg);

[cropped, cropInfo] = crop_nearfield_adaptive(abs(field).^2, cfg);
displayImage = normalize_image(cropped).^cfg.display.gamma;
displayImage = double(displayImage);
displayImage = displayImage - min(displayImage(:));
mx = max(displayImage(:));
if mx > 0, displayImage = displayImage / mx; end
displayImage = uint8(displayImage * 255);
imwrite(displayImage, fullfile(projectDir, 'validation', 'matlab_crop_before_resize.png'));
displayImage = imresize(displayImage, [224, 224], 'bilinear');

validationDir = fullfile(projectDir, 'validation');
imwrite(displayImage, fullfile(validationDir, 'matlab_reference.png'));
meta = struct( ...
    'modeCount', numModes, ...
    'labels', {modeLabels}, ...
    'cropRatio', cropInfo.cropRatio, ...
    'energyRadius', cropInfo.energyRadius, ...
    'halfSize', cropInfo.halfSize, ...
    'centroidX', cropInfo.centroidX, ...
    'centroidY', cropInfo.centroidY, ...
    'energyFraction', cropInfo.energyFraction);
fid = fopen(fullfile(validationDir, 'matlab_reference.json'), 'w', 'n', 'UTF-8');
fprintf(fid, '%s', jsonencode(meta, PrettyPrint=true));
fclose(fid);

fprintf('MATLAB reference complete: modes=%d, cropRatio=%.12f, halfSize=%d\n', ...
    numModes, cropInfo.cropRatio, cropInfo.halfSize);
