// NewsForge - Shared Provider Configuration
// Used by background.js (importScripts) and options.html (<script>)
const PROVIDERS = {
  google:       { name: 'Google Translate', type: 'free' },
  microsoft:    { name: 'Microsoft Translator', type: 'free' },
  openai:       { name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
  deepseek:     { name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  qwen:         { name: 'Qwen', type: 'openai', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-mt-turbo', models: ['qwen-mt-plus', 'qwen-mt-turbo'] },
  gemini:       { name: 'Gemini', type: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite-preview'] },
  glm:          { name: 'GLM', type: 'openai', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', models: ['glm-4-plus', 'glm-4-flash'] },
  kimi:         { name: 'Kimi', type: 'openai', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-32k', models: ['moonshot-v1-32k', 'moonshot-v1-128k'] },
  openrouter:   { name: 'OpenRouter', type: 'openai', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'nvidia/nemotron-3-super-120b-a12b:free', models: ['nvidia/nemotron-3-super-120b-a12b:free', 'qwen/qwen3-next-80b-a3b-instruct:free', 'google/gemma-4-31b-it:free', 'z-ai/glm-4.5-air:free', 'openai/gpt-oss-120b:free', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat-v3-0324', 'openai/gpt-4.1-nano'] },
  claude:       { name: 'Claude', type: 'claude', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5', models: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
  deepl:        { name: 'DeepL', type: 'deepl', endpoint: 'https://api-free.deepl.com/v2/translate' },
  custom_openai:{ name: 'Custom (OpenAI)', type: 'openai', endpoint: '', model: '' },
  custom_claude:{ name: 'Custom (Claude)', type: 'claude', endpoint: '', model: '' },
};
