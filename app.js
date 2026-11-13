const $ = (id) => document.getElementById(id);
let worker;
let ready = false;
let busy = false;
let history = [];
let loadStarted;
let loadSeconds = '';
let pendingQuestion = '';

function status(text, state) {
  $('status').textContent = text;
  $('dot').className = `dot ${state}`;
}
function controls() {
  $('prompt').disabled = !ready || busy;
  $('send').disabled = !ready || busy;
  $('reset').disabled = !ready || busy;
  document.querySelectorAll('[data-prompt]').forEach((button) => { button.disabled = !ready || busy; });
  $('messages').setAttribute('aria-busy', String(busy && ready));
}
function message(role, text) {
  const article = document.createElement('article');
  article.className = `message ${role === 'user' ? 'user-message' : 'ghost-message'}`;
  const label = document.createElement('span');
  label.className = 'speaker';
  label.textContent = role === 'user' ? 'YOU' : 'GHOST OF UCF · AI RESPONSE';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  article.append(label, paragraph);
  $('messages').append(article);
  $('messages').scrollTop = $('messages').scrollHeight;
}
function failed(text, phase) {
  busy = false;
  if (phase === 'load') {
    ready = false;
    worker?.terminate();
    worker = undefined;
    $('load').hidden = false;
    $('load').disabled = false;
    $('load').textContent = 'Retry loading';
  } else {
    // Keep the failed question in the composer so it can be retried.
    $('prompt').value = pendingQuestion;
  }
  $('progress').hidden = true;
  status(phase === 'load' ? 'Loading failed' : 'Response failed · model still loaded', 'error');
  $('load-detail').textContent = `${text} Check your connection, available memory, and browser support. If generation keeps failing, reload the page.`;
  controls();
}
$('load').addEventListener('click', () => {
  if (busy) return;
  busy = true;
  loadStarted = performance.now();
  $('load').disabled = true;
  $('load').textContent = 'Waking the ghost…';
  status('Loading library and model…', 'busy');
  $('load-detail').textContent = 'Downloading files, then preparing the CPU model. The first load can take a few minutes.';
  controls();
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => failed('The model worker stopped unexpectedly. Reload the model to continue.', 'load');
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const event = data.event;
        if (event.status === 'progress' && Number.isFinite(event.progress)) {
          $('progress').hidden = false;
          $('progress').value = event.progress;
          $('load-detail').textContent = `${event.file}: ${Math.round(event.progress)}% of this file`;
        } else if (event.status === 'done') {
          $('load-detail').textContent = 'Download complete. Preparing the model in memory…';
        }
      } else if (data.type === 'ready') {
        ready = true;
        busy = false;
        loadSeconds = ((performance.now() - loadStarted) / 1000).toFixed(1);
        status('Ready · running on your device', 'ready');
        $('progress').hidden = true;
        $('load').hidden = true;
        $('load-detail').textContent = 'Your ghost is awake. Ask a short question below.';
        $('metrics').textContent = `SmolLM2 135M · q8 · WASM CPU · Load: ${loadSeconds}s`;
        controls();
        $('prompt').focus();
      } else if (data.type === 'reply') {
        history.push({ role: 'user', content: pendingQuestion }, { role: 'assistant', content: data.reply });
        history = history.slice(-4);
        message('assistant', data.reply);
        busy = false;
        status('Ready · running on your device', 'ready');
        $('load-detail').textContent = 'Response generated locally. What else is haunting you?';
        $('metrics').textContent = `SmolLM2 135M · q8 · WASM CPU · Load: ${loadSeconds}s · Reply: ${data.seconds.toFixed(1)}s`;
        controls();
        $('prompt').focus();
      } else if (data.type === 'error') failed(data.message, data.phase);
    };
    worker.postMessage({ type: 'load' });
  } catch (error) { failed(error.message, 'load'); }
});
$('chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('prompt').value.trim();
  if (!text || !ready || busy) return;
  pendingQuestion = text;
  message('user', text);
  $('prompt').value = '';
  busy = true;
  status('Ghost is thinking…', 'busy');
  $('load-detail').textContent = 'Generating on your CPU. Short replies can still take a while.';
  controls();
  worker.postMessage({ type: 'generate', messages: [...history, { role: 'user', content: text }] });
});
$('prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('chat-form').requestSubmit();
  }
});
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
  $('prompt').value = button.dataset.prompt;
  $('prompt').focus();
}));
$('reset').addEventListener('click', () => {
  history = [];
  $('messages').replaceChildren();
  $('prompt').value = '';
  $('prompt').focus();
});
controls();
