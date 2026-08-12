const vid=document.getElementById('vid');
const btn=document.getElementById('btn');
const canvas=document.getElementById('canva');
const draw=canvas.getContext('2d');
let lastChord = null;
let synth;   
let chordSynth;
let chordPlaying = false;
const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const qualities = {
  'maj':  [0, 4, 7],
  'm':    [0, 3, 7],
  'maj7': [0, 4, 7, 11],
  '7':    [0, 4, 7, 10],
  'm7':   [0, 3, 7, 10],
  'sus4': [0, 5, 7],
  'dim':  [0, 3, 6],
  'aug':  [0, 4, 8],
};
const qualityNames = ['maj', 'm', 'maj7', '7', 'm7', 'sus4', 'dim', 'aug'];
const rootMidi = { 'C':60,'D':62,'E':64,'F':65,'G':67,'A':69,'B':71 };

function buildChord(rootName, qualityName) {
  const base = rootMidi[rootName];
  const formula = qualities[qualityName];
  return formula.map(semitones => Tone.Frequency(base + semitones, 'midi').toNote());
}
function drawDot(hand, color) {
  const x = hand[8].x * canvas.width;
  const y = hand[8].y * canvas.height;
  draw.fillStyle = color;
  draw.beginPath();
  draw.arc(x, y, 15, 0, Math.PI * 2);
  draw.fill();
}
function drawWheel(hand, items, cx, cy, radius, highlightColor) {
  const n = items.length;
  const slice = (Math.PI * 2) / n;

  // 1. draw each slice background
  for (let i = 0; i < n; i++) {
    const start = i * slice - Math.PI / 2;
    draw.beginPath();
    draw.moveTo(cx, cy);
    draw.arc(cx, cy, radius, start, start + slice);
    draw.closePath();
    draw.fillStyle = 'rgba(30,30,30,0.55)';
    draw.fill();
    draw.strokeStyle = 'rgba(255,255,255,0.25)';
    draw.stroke();
  }

  // 2. which slice is the fingertip pointing at?
  let selected = null;
  if (hand) {
    const fx = hand[8].x * canvas.width;
    const fy = hand[8].y * canvas.height;
    const dx = fx - cx;
    const dy = fy - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > radius * 0.32) {            // outside the center OFF zone
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      const i = Math.floor(angle / slice) % n;
      selected = items[i];

      const start = i * slice - Math.PI / 2;   // highlight that slice
      draw.beginPath();
      draw.moveTo(cx, cy);
      draw.arc(cx, cy, radius, start, start + slice);
      draw.closePath();
      draw.fillStyle = highlightColor;
      draw.fill();
    }
  }

  // 3. labels (counter-flipped so they aren't mirrored by the CSS flip)
  for (let i = 0; i < n; i++) {
    const mid = i * slice - Math.PI / 2 + slice / 2;
    const lx = cx + Math.cos(mid) * radius * 0.68;
    const ly = cy + Math.sin(mid) * radius * 0.68;
    draw.save();
    draw.translate(lx, ly);
    draw.scale(-1, 1);
    draw.fillStyle = '#fff';
    draw.font = 'bold 20px sans-serif';
    draw.textAlign = 'center';
    draw.textBaseline = 'middle';
    draw.fillText(items[i], 0, 0);
    draw.restore();
  }

  // 4. the OFF circle in the middle
  draw.beginPath();
  draw.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
  draw.fillStyle = 'rgba(0,0,0,0.7)';
  draw.fill();

  return selected;
}
function isPinch(hand) {
  if (!hand) return false;
  const dist = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return dist < 0.05;
}
let isPlaying = false; 
let lastNote=null;
let smoothX = 0.5;   
let smoothY = 0.5; 

const hands = new Hands({
   locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
});

hands.setOptions({
    maxNumHands:2,
    modelComplexity:1,
    minDetectionConfidence:0.6,
    minTrackingConfidence:0.5,
});
hands.onResults(onResults);
function onResults(results) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw.clearRect(0, 0, canvas.width, canvas.height);

  const found = results.multiHandLandmarks || [];
 

  let leftHand = null;
  let rightHand = null;

  if (found.length === 1) {
    const h = found[0];
    if (h[8].x < 0.5) leftHand = h;
    else rightHand = h;
  } else if (found.length >= 2) {
    const sorted = [...found].sort((a, b) => a[8].x - b[8].x);
    leftHand = sorted[0];
    rightHand = sorted[1];
  }

 // wheel geometry
    const cy = canvas.height * 0.55;
    const radius = Math.min(canvas.width, canvas.height) * 0.28;
    const leftCX = canvas.width * 0.25;
    const rightCX = canvas.width * 0.75;

    // LEFT wheel → root,  RIGHT wheel → quality
    const rootName = drawWheel(leftHand, roots, leftCX, cy, radius, 'rgba(255,158,74,0.65)') || 'C';
    const qualityName = drawWheel(rightHand, qualityNames, rightCX, cy, radius, 'rgba(74,158,255,0.65)') || 'maj';

    // fingertip cursors, drawn on top of the wheels
    if (leftHand) drawDot(leftHand, '#4a9eff');
    if (rightHand) drawDot(rightHand, '#ff9e4a');

    document.getElementById('hud').textContent =
      `Hands: ${found.length} | Chord: ${rootName}${qualityName}`;

    const pinching = isPinch(leftHand);
    const chordNotes = buildChord(rootName, qualityName);

    const chordId = `${rootName}${qualityName}`;   // a string label for "which chord"

if (pinching) {
  if (chordId !== lastChord) {          // chord changed (or just started)
    chordSynth.releaseAll();            // stop the old one cleanly
    chordSynth.triggerAttack(chordNotes);  // start the new one
    lastChord = chordId;
  }
} else {
  if (lastChord !== null) {             // not pinching → silence
    chordSynth.releaseAll();
    lastChord = null;
  }
}
}   // ← onResults still ends here  // ← onResults ENDS here



           
       



btn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    vid.srcObject = stream;
    await vid.play();

    await Tone.start();
    synth = new Tone.Synth().toDestination();

    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.15 }).toDestination();
    await reverb.generate();                       // build impulse BEFORE the loop
    chordSynth = new Tone.PolySynth(Tone.Synth).connect(reverb);
    chordSynth.volume.value = -8;
    chordSynth.set({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.08, release: 0.8 },
    });

    document.getElementById('start-screen').style.display = 'none';   // hide BEFORE loop

    async function detectloop() {
      await hands.send({ image: vid });
      requestAnimationFrame(detectloop);
    }
    detectloop();

  } catch (err) {
    console.error('camera failed:', err);
  }
});
