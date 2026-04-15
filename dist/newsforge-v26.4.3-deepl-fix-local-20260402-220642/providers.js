// NewsForge - Shared Provider Configuration
// Used by background.js (importScripts) and options.html (<script>)
const PROVIDERS = {
  google:       { name: 'Google Translate', type: 'free' },
  microsoft:    { name: 'Microsoft Translator', type: 'free' },
  openai:       { name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
  deepseek:     { name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  qwen:         { name: 'Qwen', type: 'openai', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-mt-turbo', 'qwen-mt-plus'] },
  gemini:       { name: 'Gemini', type: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
  glm:          { name: 'GLM', type: 'openai', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'] },
  minimax:      { name: 'MiniMax', type: 'openai', endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2', model: 'MiniMax-Text-01', models: ['MiniMax-Text-01', 'abab6.5s-chat'] },
  kimi:         { name: 'Kimi', type: 'openai', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  xiaomi:       { name: 'Xiaomi', type: 'openai', endpoint: 'https://api.maimiao.huami.com/v1/chat/completions', model: 'MiMo-7B-RL', models: ['MiMo-7B-RL'] },
  openrouter:   { name: 'OpenRouter', type: 'openai', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemma-3-27b-it:free', models: ['google/gemma-3-27b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'minimax/minimax-m2.5:free', 'openrouter/free'] },
  claude:       { name: 'Claude', type: 'claude', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-opus-4-20250514'] },
  deepl:        { name: 'DeepL', type: 'deepl', endpoint: 'https://api-free.deepl.com/v2/translate' },
  custom_openai:{ name: 'Custom (OpenAI)', type: 'openai', endpoint: '', model: '' },
  custom_claude:{ name: 'Custom (Claude)', type: 'claude', endpoint: '', model: '' },
};
