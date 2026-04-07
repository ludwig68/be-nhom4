const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '../..');

const resolveEnvFile = (filePath) => {
  if (!filePath) {
    return null;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
};

const buildEnvCandidates = () => {
  const envFile = process.env.ENV_FILE?.trim();
  const nodeEnv = process.env.NODE_ENV?.trim();

  if (envFile) {
    return [envFile];
  }

  if (nodeEnv === 'production') {
    return ['.env.production'];
  }

  const candidates = [];

  candidates.push('.env.local');

  if (nodeEnv && nodeEnv !== 'development') {
    candidates.push(`.env.${nodeEnv}`);
  }

  candidates.push('.env');

  return candidates;
};

const loadEnv = () => {
  const loadedFiles = [];
  const uniqueCandidates = [...new Set(buildEnvCandidates())];

  uniqueCandidates.forEach((candidate) => {
    const resolvedPath = resolveEnvFile(candidate);

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return;
    }

    dotenv.config({ path: resolvedPath, quiet: true });
    loadedFiles.push(resolvedPath);
  });

  return loadedFiles;
};

module.exports = loadEnv;
