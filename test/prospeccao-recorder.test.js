const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('os dois gravadores compartilham estado, prévia e descarte', async () => {
    const source = fs.readFileSync('pl-atendimento/painel.py', 'utf8');
    const code = source.slice(source.indexOf('let rec=null'), source.indexOf('// O painel ja sincroniza'));
    const elements = new Map();
    let stopped = false;
    const stream = { getTracks: () => [{ stop() { stopped = true; } }] };
    class Recorder {
        constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.(); }
    }
    const context = vm.createContext({
        document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {
            textContent: '', style: {}, classList: { toggle() {} }, getAttribute() { return this.src; }
        }); return elements.get(id); } },
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        MediaRecorder: Recorder, Blob, Date, selId: 'lead-a',
        URL: { createObjectURL: () => 'blob:audio', revokeObjectURL() {} },
        setInterval: () => 1, clearInterval() {}, esc: String,
    });
    vm.runInContext(code, context);
    await vm.runInContext('toggleMic()', context);
    assert.equal(elements.get('mic').textContent, '⏹ Parar');
    assert.equal(elements.get('micChat').textContent, '⏹ Parar');
    await vm.runInContext('toggleMic()', context);
    assert.equal(stopped, true);
    assert.equal(elements.get('previaChat').src, 'blob:audio');
    assert.equal(elements.get('previa').src, 'blob:audio');
    assert.equal(elements.get('envAudChat').style.display, '');
    vm.runInContext('descarta()', context);
    assert.equal(elements.get('previaChat').style.display, 'none');
    assert.equal(elements.get('gravadorChat').style.display, 'none');
});
