// BYOK (Bring Your Own Key) — API key 本地存储
// 存储位置：data/byok-keys.json（gitignored，内部工具明文可接受）

const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, '..', 'data', 'byok-keys.json');

const PROVIDERS = {
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', prefix: 'sk-ant-' },
  openai:    { name: 'OpenAI',    baseUrl: 'https://api.openai.com',    prefix: 'sk-' },
  deepseek:  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',  prefix: 'sk-' },
};

function loadKeys() {
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
}

function maskKey(key) {
  if (!key || key.length < 12) return '****';
  return key.slice(0, 8) + '…' + key.slice(-4);
}

function listKeys() {
  const raw = loadKeys();
  return Object.entries(raw).map(([provider, key]) => ({
    provider,
    name: PROVIDERS[provider]?.name || provider,
    maskedKey: maskKey(key),
    prefix: PROVIDERS[provider]?.prefix || ''
  }));
}

function getKey(provider) {
  return loadKeys()[provider] || null;
}

function setKey(provider, key) {
  if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}`);
  const keys = loadKeys();
  const updated = { ...keys, [provider]: key };
  saveKeys(updated);
}

function deleteKey(provider) {
  const keys = loadKeys();
  if (!keys[provider]) throw new Error(`No key for provider: ${provider}`);
  const { [provider]: _, ...rest } = keys;
  saveKeys(rest);
}

module.exports = { PROVIDERS, listKeys, getKey, setKey, deleteKey, maskKey };
