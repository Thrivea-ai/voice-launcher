(() => {
  'use strict';
  // voice.js (very first lines)
  window.__voice_loaded = true;
  console.log("[voice-launcher] script loaded");


  const ROOT_SEL = '#voiceLauncher';

  const $ = (sel) => document.querySelector(sel);
  const statusEl = () => $('#voiceStatus');

  function setStatus(msg) {
    const el = statusEl();
    if (el) el.textContent = msg;
    console.log('[Voice]', msg);
  }

  async function fetchSignedUrl(endpoint) {
    const r = await fetch(endpoint, { method: 'GET' });
    const text = await r.text();

    // Try JSON first, then fall back to a regex if the server wraps it oddly
    try {
      const j = JSON.parse(text);
      return j?.signed_url
          || j?.object?.signed_url
          || j?.object?.Object?.['\n']?.signed_url
          || j?.['\n']?.signed_url
          || null;
    } catch {
      const m = text.match(/"signed_url"\s*:\s*"([^"]+)"/);
      return m ? m[1] : null;
    }
  }

  async function startCall(signedUrl) {
    setStatus('Starting call…');

    const pc = new RTCPeerConnection();

    // Speaker (agent audio)
    let audio = document.getElementById('eleven-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'eleven-audio';
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      document.body.appendChild(audio);
    }
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };

    // Microphone
    setStatus('Requesting microphone…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach(t => pc.addTrack(t, mic));
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // SDP offer -> POST -> SDP answer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpEndpoint = signedUrl.replace(/^wss:/, 'https:');
    const resp = await fetch(sdpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp
    });
    if (!resp.ok) throw new Error('SDP exchange failed: HTTP ' + resp.status);

    const answer = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    setStatus('Assistant is live 🎙️');
    // Expose for debugging if needed
    window.__lexi_pc = pc;
  }

  async function onClick(btn, endpoint) {
    try {
      btn.disabled = true;
      setStatus('Fetching signed URL…');

      const signedUrl = await fetchSignedUrl(endpoint);
      if (!signedUrl) throw new Error('No signed_url in response');

      await startCall(signedUrl);
      btn.textContent = 'Assistant is live 🎙️';
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'Failed to start');
      btn.disabled = false;
      btn.textContent = '🎙️ Start Voice Assistant';
    }
  }

  function mount() {
    const root = $(ROOT_SEL);
    if (!root) return;

    const endpoint = root.getAttribute('data-token-endpoint');
    if (!endpoint) {
      setStatus('Missing data-token-endpoint');
      return;
    }

    const btn = document.getElementById('startVoice');
    if (!btn) return;

    btn.disabled = false;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick(btn, endpoint);
    }, { passive: true });
  }

  window.addEventListener('DOMContentLoaded', mount);
})();
