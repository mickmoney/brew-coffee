/*!
 * Brew Coffee House: interactive 3D latte (three-axis)
 * Dependency-free WebGL2 viewer for brew-latte.glb with quaternion trackball, spring and momentum physics.
 *
 * Usage:
 *   <div class="latte3d" data-latte-src="models/brew-latte.glb">
 *     <img class="latte3d-fallback" src="images/hero-latte.webp" alt="...">   (shown until 3D is ready, or if WebGL fails)
 *   </div>
 *   + load this file with a deferred script tag (js/brew-latte-3d.js)
 *   Containers with [data-latte-src] mount automatically. Or: const v = BrewLatte3D.mount(el, {src, ...settings}); v.destroy();
 *
 * Axes (all relative to the fixed camera):
 *   X = forward/backward tilt (around the screen's horizontal axis)
 *   Y = left/right turn       (around the vertical axis)
 *   Z = clockwise/counter-clockwise roll (around the line of sight)
 *
 * ── MOTION SETTINGS ──────────────────────────────────────────────────────────────
 * Every knob lives in DEFAULTS below. Override per instance via mount(el, {...}).
 */
(function () {
  'use strict';

  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  var DEFAULTS = {
    // Presentation pose
    homeYawDeg: -28,          // resting Y turn (negative angles the handle slightly toward the viewer)
    homeTiltDeg: 0,           // resting X tilt
    homeRollDeg: 0,           // resting Z roll

    // Hover (mouse only): gentle follow
    hoverTiltDeg: 6,          // ± X tilt toward the pointer
    hoverYawDeg: 8,           // ± Y turn toward the pointer
    hoverRollDeg: 2,          // ± Z roll (leans toward the pointer horizontally)
    hoverStiffness: 34,       // rotational spring strength (higher = snappier)
    hoverDamping: 10,         // spring damping (lower = more float; ≈2·√stiffness = no overshoot)

    // Drag: virtual trackball
    trackballRadius: 0.62,    // trackball radius as a fraction of the container's smaller side. Inside: tilt/turn; outside: roll
    dragGain: 1.0,            // rotation multiplier for drags (1 = the cup follows the finger exactly on the ball)
    velocityWindowMs: 90,     // how far back we look to measure flick speed
    stillnessMs: 70,          // pointer still this long before release = no momentum

    // Momentum + return
    maxReleaseVelocityDeg: 1300, // cap on spin speed at release (deg/s)
    glideSecondsGentle: 2.8,  // "friction": how long a gentle flick glides before settling (s)
    glideSecondsStrong: 5.6,  // how long the strongest flick glides before settling (s). Coast distance follows from speed × time
    maxCoastRevolutions: 3.4, // ceiling on coast turns; the shortest-path return adds ≤ 0.5 turn, so the total stays < 4
    minFlickVelocityDeg: 40,  // releases slower than this simply ease home (deg/s)
    returnStiffness: 3.6,     // settle-home spring frequency (rad/s) after slow releases (critically damped)
    returnBlendStart: 0.35,   // fraction of the glide after which the return-to-pose blend begins

    // Touch
    touchMode: 'free',        // 'free': touch drags on the cup rotate on all three axes (swipes outside the cup scroll the page).
                              // 'pan': horizontal swipes turn the cup (Y) only and vertical swipes scroll the page.

    // Rendering
    maxPixelRatio: 2,
    // Maker's mark on the underside of the saucer (visible when the cup is turned over)
    bottomMark: true,         // show the Brew Coffee House logo under the saucer
    bottomMarkColor: '#2e2b29', // ink colour of the stamp
    bottomMarkWidth: 0.64,    // logo width in model units (the saucer's flat foot is 0.80 across)
    overscan: 0.28,           // canvas extends this far past the container on each side so tilts/rolls never clip
    cameraFovDeg: 30,
    cameraElevationDeg: 38,
    cameraDistance: 4.4,
    target: [0, 0.30, 0],
    pivot: [0, 0.55, 0]       // rotation centre: on the cup's vertical axis, mid-height of the assembly
  };

  // Brew Coffee House logo artwork (from brew_logo.svg), used for the stamp under the saucer
  var LOGO_VIEWBOX = '0 0 580.08 276.17';
  var LOGO_PATHS = '<g > <g> <path d="M579.86,228.78H0S.05.01.05.01h579.8s.01,228.77.01,228.77ZM573.72,222.8V5.89s-567.62,0-567.62,0l.09,216.92h567.53Z"/> <path d="M417.24,248.78c7.38,1.92,11.12,9.09,10.04,15.63-1.15,6.95-7.26,11.62-14.33,11.71-9.24.12-15.78-6.72-15.09-15.17.76-9.28,9.59-14.72,19.38-12.17ZM409.87,254.02c-5.36,1.88-6.48,7.41-5.02,11.23,1.75,4.58,6.47,6.27,10.36,5.07,4.92-1.52,6.72-6.58,5.41-11.03-1.22-4.15-5.82-7-10.75-5.27Z"/> <path d="M68.39,276.11c-8.56-.03-14.77-6.2-14.81-14.01s6.63-14.17,15.15-14.03,14.47,6.18,14.47,14.02c0,7.78-6.33,14.05-14.82,14.02ZM64.97,254.25c-4.98,2.2-5.98,8-4.08,11.83,2.06,4.15,6.81,5.68,10.94,3.91,4.35-1.87,5.92-7,4.33-11.24-1.57-4.18-6.31-6.67-11.19-4.5Z"/> <polygon points="369.14 275.37 362.81 275.63 362.85 264.51 350.66 264.53 350.68 275.62 344.2 275.55 344.26 248.87 350.71 248.54 350.67 259.35 362.8 259.2 362.81 248.6 369.1 248.66 369.14 275.37"/> <path d="M474.3,248.87l6.39-.24-.23,16.72c-.09,6.41-5.2,10.33-11,10.77-7.4.57-13.36-3.99-13.39-11.62l-.06-15.89,6.43-.02.09,17.26c.01,2.77,3.51,4.94,5.82,4.89,3.29-.07,5.9-2.49,5.91-5.99l.05-15.88Z"/> <polygon points="277.96 264.46 265.61 264.39 265.74 270.61 279.88 270.57 280.47 275.56 259.25 275.6 259.25 248.59 279.66 248.59 279.8 253.59 265.72 253.57 265.71 259.48 278.11 259.41 277.96 264.46"/> <polygon points="578.27 264.27 565.64 264.44 565.74 270.59 580.08 270.62 579.96 275.57 559.24 275.6 559.2 248.6 579.68 248.58 579.79 253.61 565.69 253.6 565.73 259.45 578.05 259.45 578.27 264.27"/> <path d="M228.39,264.27l-12.78.16.11,6.16h14.37s-.1,5-.1,5h-20.78s.04-27,.04-27h20.51s.05,5.02.05,5.02l-14.16.02.22,5.82h10.93c.69,0,1.24,2.15,1.6,4.83Z"/> <path d="M525.37,275.13c-5.6,1.71-11.18.97-16.64-1.65l1.62-4.94c8.93,4.36,15.42,1.75,14.39-.47-.29-.63-1.62-2.04-2.3-2.24l-8.49-2.5c-2.62-.77-5.03-4.04-5.05-6.2-.03-3.28,1.71-6.46,4.78-7.67,5.63-2.21,11.66-1.76,16.19,1.38l-1.98,3.54c-.83,1.48-10.69-5.18-13.15,2.96l9.29,3.06c3.55,1.17,6.77,3.31,6.91,6.7s-2,6.93-5.58,8.03Z"/> <path d="M22.7,267.4l4.37,3.93c-3.03,2.86-6.11,4.38-9.87,4.73-8.87.82-15.81-5.46-16.09-13.3-.33-8.9,6.83-15.29,15.82-14.62,4,.29,7,1.77,10.08,4.66l-4.12,3.87c-3.97-4.05-9.04-4.11-12.62-1.05-3.58,3.05-3.78,9.13-.46,12.44s8.63,4.04,12.89-.66Z"/> <polygon points="130.56 260.71 130.71 265.78 118.09 265.77 118.08 275.58 111.82 275.49 111.81 248.58 132.08 248.59 132.03 253.62 118.13 253.58 118.1 260.7 130.56 260.71"/> <polygon points="178.99 260.68 179.29 265.8 166.85 265.76 166.82 275.61 160.54 275.46 160.56 248.59 180.87 248.58 180.94 253.63 166.85 253.58 166.89 260.74 178.99 260.68"/> <path d="M541.46,190.59H38.46s-.04-152.47-.04-152.47l503.04.02v152.45ZM117.42,113.4c6.82-3.52,9.9-9.47,9.89-16.31-.01-6.51-3.59-11.89-9.75-15.38-4.82-1.81-10.27-3.37-15.65-3.37h-38.08s-.02,73.27-.02,73.27l41.09-.08c6.11-.01,12.24-1.89,17.55-4.22,6.7-4.46,9.35-11.02,8.3-18.96-.88-6.67-5.31-12.21-13.34-14.95ZM248.88,151.55l-16.42-23.64c10.18-4.18,15.17-13.11,15.14-23.28-.03-10.05-5.12-18.24-14.09-22.87-5.09-1.88-10.92-3.44-16.6-3.44l-32.85.03v73.21s16.91.03,16.91.03l.13-20.49,15.71.14,13.8,20.25,18.26.06ZM351.96,120.95l-.06-13.16-34.03.04v-15.95s38.69-.06,38.69-.06l-.09-13.51h-55.41s-.01,73.27-.01,73.27h56.73s-.14-13.64-.14-13.64l-39.74.07-.07-17.04,34.12-.03ZM506,78.57l-16.89,51.44-16.88-51.68-15.61.02-17.31,51.39-16.54-51.35h-17.51s24.06,73.29,24.06,73.29l18.06-.2,16.65-49.38,16.13,49.46,18.23-.05,23.87-73.03-16.26.1Z"/> <path d="M105.2,138.48l-24.53.4.04-18.31,24.69.44c4.98.09,8.31,4.23,8.58,8.12.31,4.43-3.03,9.25-8.78,9.35Z"/> <path d="M102.54,107.89l-21.82.55-.04-17.51,21.16.42c4.72.09,8.21,3.95,8.47,7.72.27,3.95-2.43,8.68-7.77,8.82Z"/> <path d="M219.08,117.26l-18.07.48.02-25.73,16.79.29c7.36.13,12.32,5.19,12.64,11.97.29,6.18-3.34,12.77-11.38,12.99Z"/> </g> </g>';

  /* ───────────────────────────── math helpers (column-major) ───────────────────────────── */
  function perspective(fovy, aspect, n, f) {
    var t = 1 / Math.tan(fovy / 2);
    return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  }
  function lookAt(e, c, u) {
    var z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // quaternions [x, y, z, w]
  function qmul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  function qaxis(ax, ang) { var s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; }
  function qvec(v) { var a = Math.hypot(v[0], v[1], v[2]); return a < 1e-12 ? [0, 0, 0, 1] : qaxis([v[0] / a, v[1] / a, v[2] / a], a); } // rotation vector -> quat
  function qconj(a) { return [-a[0], -a[1], -a[2], a[3]]; }
  function qnorm(a) { var l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; }
  function qdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
  function qlog(a) { // shortest-path rotation vector of a unit quaternion
    if (a[3] < 0) a = [-a[0], -a[1], -a[2], -a[3]];
    var s = Math.hypot(a[0], a[1], a[2]); if (s < 1e-9) return [0, 0, 0];
    var ang = 2 * Math.atan2(s, a[3]); return [a[0] / s * ang, a[1] / s * ang, a[2] / s * ang];
  }
  function qangle(a, b) { return 2 * Math.acos(Math.min(1, Math.abs(qdot(a, b)))); }
  function qslerp(a, b, t) {
    var d = qdot(a, b); if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }   // shortest path
    if (d > 0.9995) return qnorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
    var th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
  }
  function qmat(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
            2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
            2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
  }
  function smoother(x) { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (x * 6 - 15) + 10); }

  /* ───────────────────────────── shaders ───────────────────────────── */
  var VS = '#version 300 es\n' +
    'in vec3 aPos; in vec3 aNor; in vec2 aUV;\n' +
    'uniform mat4 uModel, uViewProj;\n' +
    'out vec3 vW; out vec3 vN; out vec2 vUV; out vec3 vM;\n' +
    'void main(){ vec4 w = uModel*vec4(aPos,1.0); vW=w.xyz; vN=mat3(uModel)*aNor; vUV=aUV; vM=aPos; gl_Position=uViewProj*w; }';

  var FS = '#version 300 es\nprecision highp float;\n' +
    'in vec3 vW; in vec3 vN; in vec2 vUV; in vec3 vM;\n' +
    'uniform vec3 uCam; uniform sampler2D uTex; uniform sampler2D uMark; uniform int uKind; uniform vec3 uBase;\n' +
    'out vec4 o;\n' +
    'vec3 toLin(vec3 c){return pow(c,vec3(2.2));}\n' +
    'void main(){\n' +
    '  vec3 V=normalize(uCam-vW);\n' +
    '  vec3 N=normalize(vN); if(dot(N,V)<0.0) N=-N;\n' +   // face the viewer: independent of triangle winding
    '  vec3 L1=normalize(vec3(-0.55,0.95,0.55)), C1=vec3(1.0,0.96,0.90)*0.85;\n' +   // warm key, upper left
    '  vec3 L2=normalize(vec3(0.85,0.35,0.45)),  C2=vec3(0.80,0.85,0.95)*0.32;\n' +   // cool fill, right
    '  vec3 L3=normalize(vec3(0.10,0.55,-1.0)),  C3=vec3(1.0)*0.55;\n' +              // rim, behind
    '  vec3 sky=vec3(0.62,0.63,0.66), gnd=vec3(0.16,0.15,0.14);\n' +
    '  vec3 hemi=mix(gnd,sky,N.y*0.5+0.5)*0.48;\n' +
    '  float d1=max(dot(N,L1),0.0), d2=max(dot(N,L2),0.0), d3=max(dot(N,L3),0.0);\n' +
    '  vec3 col;\n' +
    '  if(uKind==1){\n' +   // coffee + foam (texture already carries soft lighting)
    '    vec3 a=toLin(texture(uTex,vUV).rgb);\n' +
    '    col=a*(0.78+0.30*d1+0.10*d2);\n' +
    '    vec3 H=normalize(L1+V); col+=C1*pow(max(dot(N,H),0.0),36.0)*0.05;\n' +
    '  } else {\n' +        // glazed porcelain
    '    vec3 a=toLin(uBase);\n' +
    '    float ao=1.0;\n' +
    '    if(uKind==2 && vM.y>0.08){ float r=length(vM.xz); ao=mix(0.30,1.0,smoothstep(0.42,1.25,r)); ao*=mix(1.0,0.82,smoothstep(1.0,1.32,r)); }\n' +   // saucer darkens under the cup
    '    if(uKind==0 && vM.y<0.30){ ao=mix(0.7,1.0,smoothstep(0.15,0.30,vM.y)); }\n' +
    '    col=a*(hemi*ao + C1*d1*mix(0.6,1.0,ao) + C2*d2 + C3*d3*0.6);\n' +
    '    vec3 H1=normalize(L1+V), H2=normalize(L2+V);\n' +
    '    col+=C1*pow(max(dot(N,H1),0.0),140.0)*0.9 + C2*pow(max(dot(N,H2),0.0),90.0)*0.6 + C1*pow(max(dot(N,H1),0.0),14.0)*0.10;\n' +
    '    if(uKind==2){ float r=length(vM.xz); col*=mix(1.0,0.86,smoothstep(0.6,1.3,r)*(0.5+0.5*vW.z/1.3)); }\n' +
    '    float F=0.04+0.96*pow(1.0-max(dot(N,V),0.0),5.0);\n' +
    '    vec3 R=reflect(-V,N); vec3 env=mix(gnd*0.7,vec3(0.92,0.92,0.94),smoothstep(-0.1,0.75,R.y));\n' +
    '    col=mix(col,env*ao,F*0.75);\n' +
    '  }\n' +
    '  col=vec3(1.0)-exp(-col*1.15);\n' +    // gentle filmic rolloff
    '  if(uKind==3){ float a=texture(uMark,vUV).a*0.92; o=vec4(pow(col,vec3(1.0/2.2))*a,a); return; }\n' +   // stamp: premultiplied, blended over the saucer
    '  o=vec4(pow(col,vec3(1.0/2.2)),1.0);\n' +
    '}';

  var SVS = '#version 300 es\nin vec2 aP; uniform mat4 uViewProj; uniform float uR; out vec2 vP;\n' +
    'void main(){ vP=aP; gl_Position=uViewProj*vec4(aP.x*uR,0.0,aP.y*uR,1.0); }';
  var SFS = '#version 300 es\nprecision highp float; in vec2 vP; uniform float uA; out vec4 o;\n' +
    'void main(){ float d=length(vP); float a=(1.0-smoothstep(0.55,1.0,d))*0.5 + (1.0-smoothstep(0.0,0.62,d))*0.35; a*=uA; o=vec4(0.0,0.0,0.0,a); }';

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* ───────────────────────────── GLB loader (positions, normals, uvs, embedded JPEG) ───────────────────────────── */
  function parseGLB(buf) {
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
    var jsonLen = dv.getUint32(12, true);
    var json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    var binStart = 20 + jsonLen + 8;
    function view(i) { var v = json.bufferViews[i]; return { off: binStart + (v.byteOffset || 0), len: v.byteLength }; }
    function accessor(i) {
      var a = json.accessors[i], v = view(a.bufferView), size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
      var off = v.off + (a.byteOffset || 0);
      if (a.componentType === 5126) return new Float32Array(buf.slice(off, off + a.count * size * 4));
      if (a.componentType === 5125) return new Uint32Array(buf.slice(off, off + a.count * 4));
      if (a.componentType === 5123) return new Uint16Array(buf.slice(off, off + a.count * 2));
      throw new Error('Unsupported component type');
    }
    var meshes = json.meshes.map(function (m) {
      var p = m.primitives[0], at = p.attributes;
      return {
        name: m.name, material: p.material,
        pos: accessor(at.POSITION), nor: accessor(at.NORMAL),
        uv: at.TEXCOORD_0 != null ? accessor(at.TEXCOORD_0) : null, idx: accessor(p.indices)
      };
    });
    var image = null;
    if (json.images && json.images.length) {
      var iv = view(json.images[0].bufferView);
      image = new Blob([new Uint8Array(buf, iv.off, iv.len)], { type: json.images[0].mimeType || 'image/jpeg' });
    }
    return { meshes: meshes, materials: json.materials || [], image: image };
  }

  /* ───────────────────────────── model loading ───────────────────────────── */
  // data: URIs are decoded directly (some sandboxed previews block fetch() of data URLs). Regular URLs use fetch,
  // falling back to XMLHttpRequest. Note: browsers block both when a page is opened straight from disk (file://);
  // serve the folder from a web server (Netlify, or `python -m http.server`) instead.
  function loadBinary(src) {
    if (!src) return Promise.reject(new Error('No model source'));
    if (/^data:/i.test(src)) {
      return new Promise(function (resolve) {
        var b64 = src.slice(src.indexOf(',') + 1), bin = atob(b64), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        resolve(out.buffer);
      });
    }
    function viaXHR() {
      return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest(); x.open('GET', src); x.responseType = 'arraybuffer';
        x.onload = function () { (x.status === 200 || (x.status === 0 && x.response)) ? resolve(x.response) : reject(new Error('HTTP ' + x.status)); };
        x.onerror = function () { reject(new Error('Could not load ' + src + (location.protocol === 'file:' ? ' (pages opened from disk cannot load models; use a web server)' : ''))); };
        x.send();
      });
    }
    if (!window.fetch) return viaXHR();
    return fetch(src).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .catch(function () { return viaXHR(); });
  }

  /* ───────────────────────────── viewer ───────────────────────────── */
  function mount(el, opts) {
    opts = opts || {};
    var S = {}; for (var k in DEFAULTS) S[k] = DEFAULTS[k]; for (k in opts) if (k in DEFAULTS) S[k] = opts[k];
    var src = opts.src || el.getAttribute('data-latte-src');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var canvas = document.createElement('canvas');
    canvas.className = 'latte3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    // The canvas overscans the container so tilts and rolls never clip. It ignores the pointer; the container handles input.
    canvas.style.cssText = 'position:absolute;pointer-events:none;left:' + (-S.overscan * 100) + '%;top:' + (-S.overscan * 100) +
      '%;width:' + (100 + 2 * S.overscan * 100) + '%;height:' + (100 + 2 * S.overscan * 100) + '%;';
    el.appendChild(canvas);
    el.setAttribute('role', 'img');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Interactive 3D latte. Drag to rotate it in any direction.');

    var gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) { canvas.remove(); el.classList.add('latte3d--failed'); return { destroy: function () {} }; }

    var prog, sprog, meshes = [], shadowVAO, shadowBuf, tex, viewProj, camPos, disposed = false;
    var mark = null; // { vao, bufs, count, tex, ready }
    var raf = 0, last = 0, visible = true, pageVisible = !document.hidden, needsFrame = true;
    var camRight = [1, 0, 0], camBack = [0, 0, 1], UP = [0, 1, 0];

    // ── motion state ──
    function eulerQ(tiltX, yawY, rollZ) {
      // X around the screen horizontal, Y around vertical, Z around the line of sight (applied in that visual order)
      return qnorm(qmul(qaxis(camBack, rollZ), qmul(qaxis(camRight, tiltX), qaxis(UP, yawY))));
    }
    var home = [0, 0, 0, 1];
    function computeHome() { home = eulerQ(S.homeTiltDeg * DEG, S.homeYawDeg * DEG, S.homeRollDeg * DEG); }
    computeHome();
    var st = {
      mode: 'idle',               // 'idle' (hover/settled) | 'dragging' | 'coasting' | 'returning'
      q: home.slice(),            // current orientation (world space)
      w: [0, 0, 0],               // angular velocity (rad/s, world axis)
      inside: false, hx: 0, hy: 0,
      drag: null, samples: [], coast: null, retTarget: null,
      revs: 0
    };
    var rest = null; // reduced motion: the cup stays where it was released

    /* ── GL setup ── */
    function setup(model) {
      prog = compile(gl, VS, FS); sprog = compile(gl, SVS, SFS);
      var locP = gl.getAttribLocation(prog, 'aPos'), locN = gl.getAttribLocation(prog, 'aNor'), locU = gl.getAttribLocation(prog, 'aUV');
      model.meshes.forEach(function (m) {
        var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        var bufs = [];
        function attr(loc, data, n) {
          if (loc < 0) return;
          var b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
        }
        attr(locP, m.pos, 3); attr(locN, m.nor, 3);
        if (m.uv) attr(locU, m.uv, 2); else if (locU >= 0) { gl.disableVertexAttribArray(locU); gl.vertexAttrib2f(locU, 0, 0); }
        var ib = gl.createBuffer(); bufs.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        var mat = model.materials[m.material] || {}, pbr = mat.pbrMetallicRoughness || {};
        var kind = pbr.baseColorTexture ? 1 : (/saucer/i.test(m.name) ? 2 : 0);
        meshes.push({ vao: vao, bufs: bufs, count: m.idx.length, type: m.idx instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
          kind: kind, base: (pbr.baseColorFactor || [0.94, 0.94, 0.93]).slice(0, 3) });
      });
      shadowVAO = gl.createVertexArray(); gl.bindVertexArray(shadowVAO);
      shadowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var la = gl.getAttribLocation(sprog, 'aP'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      if (S.bottomMark) setupMark(locP, locN, locU);
    }
    function setupMark(locP, locN, locU) {
      // A thin disc just under the saucer's flat foot (foot plane y = 0.075), facing down, textured with the logo.
      var half = S.bottomMarkWidth / 2, y = 0.0742;
      var pos = new Float32Array([-half, y, -half,  half, y, -half,  half, y, half,  -half, y, half]);
      var nor = new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
      // UVs chosen so the logo reads correctly (not mirrored) when viewed from underneath, upright relative to the handle
      var uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
      var idx = new Uint16Array([0, 2, 1, 0, 3, 2]);
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao); var bufs = [];
      [[locP, pos, 3], [locN, nor, 3], [locU, uv, 2]].forEach(function (a) {
        if (a[0] < 0) return;
        var b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a[1], gl.STATIC_DRAW);
        gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, 0, 0);
      });
      var ib = gl.createBuffer(); bufs.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      mark = { vao: vao, bufs: bufs, count: 6, tex: null, ready: false };
      // Rasterise the logo (a square canvas; the logo is centred and fills the width, with its true proportions)
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + LOGO_VIEWBOX + '" fill="#000">' + LOGO_PATHS + '</svg>';
      var img = new Image();
      img.onload = function () {
        if (disposed || !mark) return;
        var N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
        var g = c.getContext('2d'), vb = LOGO_VIEWBOX.split(' ').map(Number), w = N * 0.96, h = w * vb[3] / vb[2];
        g.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
        mark.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, mark.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        mark.ready = true; wake();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    function hexRGB(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
    function uploadTexture(bitmap) {
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    function resize() {
      var r = el.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, S.maxPixelRatio), k = 1 + 2 * S.overscan;
      var w = Math.max(1, Math.round(r.width * k * dpr)), h = Math.max(1, Math.round(r.height * k * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      var e2 = S.cameraElevationDeg * DEG, t = S.target;
      camPos = [t[0], t[1] + Math.sin(e2) * S.cameraDistance, t[2] + Math.cos(e2) * S.cameraDistance];
      camBack = norm([camPos[0] - t[0], camPos[1] - t[1], camPos[2] - t[2]]);
      camRight = norm(cross(UP, camBack));
      // widen the field of view by the overscan so the cup keeps the same on-screen size as the container framing
      var fov = 2 * Math.atan(Math.tan(S.cameraFovDeg * DEG / 2) * k);
      viewProj = mul(perspective(fov, w / h, 0.1, 50), lookAt(camPos, t, UP));
      if (st.mode === 'idle' && qangle(st.q, home) < 1e-6) { computeHome(); st.q = home.slice(); } else computeHome();
      wake();
    }

    function draw() {
      if (!prog) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(sprog);
      gl.uniformMatrix4fv(gl.getUniformLocation(sprog, 'uViewProj'), false, viewProj);
      gl.uniform1f(gl.getUniformLocation(sprog, 'uR'), 1.5);
      gl.uniform1f(gl.getUniformLocation(sprog, 'uA'), 0.9);
      gl.bindVertexArray(shadowVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(prog);
      var p = S.pivot;
      var model = mul(trans(p[0], p[1], p[2]), mul(qmat(st.q), trans(-p[0], -p[1], -p[2])));
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uModel'), false, model);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uViewProj'), false, viewProj);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uCam'), camPos);
      if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0); }
      var uKind = gl.getUniformLocation(prog, 'uKind'), uBase = gl.getUniformLocation(prog, 'uBase');
      meshes.forEach(function (m) {
        gl.uniform1i(uKind, m.kind); gl.uniform3fv(uBase, m.base);
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
      });
      gl.bindVertexArray(null);
      if (mark && mark.ready) {
        // printed stamp: blended on top of the saucer's underside, pulled slightly toward the camera so it never z-fights
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2); gl.depthMask(false);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mark.tex); gl.uniform1i(gl.getUniformLocation(prog, 'uMark'), 1);
        gl.uniform1i(uKind, 3); gl.uniform3fv(uBase, hexRGB(S.bottomMarkColor));
        gl.bindVertexArray(mark.vao); gl.drawElements(gl.TRIANGLES, mark.count, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); gl.activeTexture(gl.TEXTURE0);
      }
    }

    /* ── physics ── */
    // Rotational damped spring toward a target orientation (shortest path). Carries angular velocity across mode changes.
    function springTo(target, k, c, dt) {
      var e = qlog(qmul(target, qconj(st.q)));
      st.w = [st.w[0] + (k * e[0] - c * st.w[0]) * dt, st.w[1] + (k * e[1] - c * st.w[1]) * dt, st.w[2] + (k * e[2] - c * st.w[2]) * dt];
      st.q = qnorm(qmul(qvec([st.w[0] * dt, st.w[1] * dt, st.w[2] * dt]), st.q));
      return qangle(target, st.q) < 2e-4 && Math.hypot(st.w[0], st.w[1], st.w[2]) < 2e-3;
    }
    function hoverTarget() {
      if (reduced) return rest || home;
      if (!st.inside) return home;
      // pointer right → turn right (+Y) and lean right (−Z); pointer up → tilt top toward it (−X)
      return qnorm(qmul(eulerQ(-st.hy * S.hoverTiltDeg * DEG, st.hx * S.hoverYawDeg * DEG, -st.hx * S.hoverRollDeg * DEG), home));
    }

    function startCoast(wv) {
      // Momentum: spin about the release axis on an ease-out curve  θ(t) = Θ·(1 − (1 − t/T)^6),  T = 6Θ/|ω|,
      // so it starts at exactly the release speed and decelerates smoothly to zero. Θ is chosen near the natural
      // coasting angle for the chosen glide time so the spin ends as close to the presentation pose as possible, and the last part
      // of the glide blends (smootherstep) into the pose along the shortest path: no snap, no unwinding.
      var s = Math.hypot(wv[0], wv[1], wv[2]), axis = [wv[0] / s, wv[1] / s, wv[2] / s];
      var maxTheta = Math.min(S.maxCoastRevolutions, 3.5) * TAU;
      var glide = S.glideSecondsGentle + (S.glideSecondsStrong - S.glideSecondsGentle) * Math.min(1, s / (S.maxReleaseVelocityDeg * DEG));
      var natural = Math.min(s * glide / 6, maxTheta);   // distance that makes θ(t) last `glide` seconds
      var lo = Math.max(0.05, natural * 0.6), hi = Math.min(maxTheta, natural * 1.3), best = natural, bestScore = Infinity;
      for (var th = lo; th <= hi + 1e-9; th += DEG) {
        var resid = qangle(qmul(qaxis(axis, th), st.q), home);
        var score = resid + 0.35 * Math.abs(Math.log(th / natural));
        if (score < bestScore) { bestScore = score; best = th; }
      }
      var T = 6 * best / s;
      if (T < 0.6) return startReturn(wv);
      st.mode = 'coasting';
      st.coast = { t: 0, T: T, theta: best, axis: axis, q0: st.q.slice() };
    }
    function startReturn(wv) { st.mode = 'returning'; st.w = wv ? wv.slice() : [0, 0, 0]; }

    function step(dt) {
      if (st.mode === 'coasting') {
        var c = st.coast; c.t += dt;
        var u = Math.min(c.t / c.T, 1), q = 1 - u, q5 = q * q * q * q * q;
        var theta = c.theta * (1 - q5 * q);
        var spin = qnorm(qmul(qaxis(c.axis, theta), c.q0));
        var b = smoother((u - S.returnBlendStart) / (1 - S.returnBlendStart));
        var prev = st.q;
        st.q = qslerp(spin, home, b);
        if (qdot(st.q, prev) < 0) st.q = [-st.q[0], -st.q[1], -st.q[2], -st.q[3]]; // keep the representation continuous
        var sp = 6 * c.theta / c.T * q5; st.w = [c.axis[0] * sp, c.axis[1] * sp, c.axis[2] * sp];
        st.revs = theta / TAU;
        if (u >= 1) { st.q = home.slice(); st.w = [0, 0, 0]; st.mode = 'idle'; }
        return true;
      }
      if (st.mode === 'returning') {
        var wr = S.returnStiffness;
        if (springTo(home, wr * wr, 2 * wr, dt)) { st.q = home.slice(); st.w = [0, 0, 0]; st.mode = 'idle'; }
        return true;
      }
      if (st.mode === 'dragging') return true;
      // idle: hover-follow or rest
      var tgt = hoverTarget();
      if (springTo(tgt, S.hoverStiffness, S.hoverDamping, dt)) { st.q = tgt.slice(); st.w = [0, 0, 0]; return false; }
      return true;
    }

    function frame(now) {
      raf = 0;
      if (disposed || !visible || !pageVisible) return;
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60; last = now;
      var moving = false, n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (var i = 0; i < n; i++) moving = step(h) || moving;
      draw();
      el.classList.toggle('is-moving', st.mode !== 'idle' || qangle(st.q, home) > 4 * DEG);
      if (moving || st.mode !== 'idle' || needsFrame) { needsFrame = false; raf = requestAnimationFrame(frame); }
      else last = 0; // settled: stop rendering until something changes
    }
    function wake() { needsFrame = true; if (!raf && !disposed && visible && pageVisible) { last = 0; raf = requestAnimationFrame(frame); } }

    /* ── input ── */
    function local(e) { var r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height * 2 - 1), r: r }; }
    function ballVec(e) {
      // Virtual trackball (Shoemake): inside the ball a point maps onto the sphere (tilt/turn); outside it maps onto the
      // rim (z = 0), so circling the edge produces pure roll. Coordinates are in screen units of the trackball radius.
      var r = el.getBoundingClientRect(), R = Math.min(r.width, r.height) * S.trackballRadius;
      var x = (e.clientX - (r.left + r.width / 2)) / R, y = -(e.clientY - (r.top + r.height / 2)) / R;
      if (st.drag && st.drag.lockY) y = st.drag.y0;   // touch pan mode: horizontal swipes only turn the cup
      var d2 = x * x + y * y;
      if (d2 <= 1) return [x, y, Math.sqrt(1 - d2)];
      var d = Math.sqrt(d2); return [x / d, y / d, 0];
    }
    function viewToWorld(v) {
      // screen-right → camera right, screen-up → world up (so horizontal drags turn about the cup's own vertical axis),
      // toward-viewer → line of sight (roll)
      return [v[0] * camRight[0] + v[1] * UP[0] + v[2] * camBack[0],
              v[0] * camRight[1] + v[1] * UP[1] + v[2] * camBack[1],
              v[0] * camRight[2] + v[1] * UP[2] + v[2] * camBack[2]];
    }
    function onMove(e) {
      if (st.mode === 'dragging' && st.drag && e.pointerId === st.drag.id) {
        var v = ballVec(e), a = st.drag.v, ax = cross(a, v), sn = Math.hypot(ax[0], ax[1], ax[2]), cs = dot(a, v);
        if (sn > 1e-7) {
          var ang = Math.atan2(sn, cs) * S.dragGain, wax = norm(viewToWorld([ax[0] / sn, ax[1] / sn, ax[2] / sn]));
          st.q = qnorm(qmul(qaxis(wax, ang), st.q));
        }
        st.drag.v = v;
        var t = e.timeStamp || performance.now(); st.samples.push({ t: t, q: st.q.slice() });   // event timestamps stay accurate when busy
        while (st.samples.length > 2 && t - st.samples[0].t > S.velocityWindowMs) st.samples.shift();
        wake(); return;
      }
      if (e.pointerType !== 'mouse') return; // no hover on touch/pen
      var p = local(e); st.inside = true; st.hx = Math.max(-1, Math.min(1, p.x)); st.hy = Math.max(-1, Math.min(1, p.y));
      if (st.mode === 'idle') wake();
    }
    function onLeave(e) { if (e.pointerType === 'mouse' && !st.drag) { st.inside = false; st.hx = st.hy = 0; if (st.mode === 'idle') wake(); } }
    function onDown(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // take over from any motion immediately: continue from the current orientation, no jump
      st.mode = 'dragging'; st.coast = null; st.w = [0, 0, 0];
      var lockY = e.pointerType !== 'mouse' && S.touchMode === 'pan';
      st.drag = { id: e.pointerId, type: e.pointerType, lockY: lockY, y0: 0 };
      st.drag.v = ballVec(e);
      st.samples = [{ t: e.timeStamp || performance.now(), q: st.q.slice() }];
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('is-grabbing');
      if (e.pointerType === 'mouse') e.preventDefault();
      wake();
    }
    function release(e, cancelled) {
      if (!st.drag || (e && e.pointerId !== st.drag.id)) return;
      var now = (e && e.timeStamp) || performance.now(), wv = [0, 0, 0], s = st.samples;
      if (!cancelled && s.length >= 2 && now - s[s.length - 1].t < S.stillnessMs) {
        var a = s[0], b = s[s.length - 1], dts = (b.t - a.t) / 1000;
        if (dts > 0.004) { var rv = qlog(qmul(b.q, qconj(a.q))); wv = [rv[0] / dts, rv[1] / dts, rv[2] / dts]; }
      }
      var sp = Math.hypot(wv[0], wv[1], wv[2]), vmax = S.maxReleaseVelocityDeg * DEG;
      if (sp > vmax) { wv = [wv[0] * vmax / sp, wv[1] * vmax / sp, wv[2] * vmax / sp]; sp = vmax; }
      var d = st.drag; st.drag = null; st.samples = []; el.classList.remove('is-grabbing');
      try { el.releasePointerCapture(d.id); } catch (_) {}
      if (e && d.type === 'mouse') { var p = local(e); st.inside = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1; if (!st.inside) st.hx = st.hy = 0; }
      st.lastRelease = { speedDeg: sp / DEG, axis: sp ? [wv[0] / sp, wv[1] / sp, wv[2] / sp] : null };
      if (reduced) { st.mode = 'idle'; st.w = [0, 0, 0]; rest = st.q.slice(); }   // no momentum or settling: stays where released
      else if (sp < S.minFlickVelocityDeg * DEG) startReturn(wv);
      else startCoast(wv);
      wake();
    }
    function onUp(e) { release(e, false); }
    function onCancel(e) { release(e, true); }

    // Touch: full three-axis rotation on the cup itself (touch-action: none); swipes outside the cup scroll the page.
    function applyTouchAction() { el.style.touchAction = S.touchMode === 'pan' ? 'pan-y' : 'none'; }
    applyTouchAction();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('lostpointercapture', onCancel);
    el.addEventListener('pointerleave', onLeave);

    var ro = new ResizeObserver(resize); ro.observe(el);
    var io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); }, { rootMargin: '100px' });
    io.observe(el);
    function onVis() { pageVisible = !document.hidden; if (pageVisible) wake(); }
    document.addEventListener('visibilitychange', onVis);

    /* ── load ── */
    loadBinary(src)
      .then(function (buf) {
        if (disposed) return;
        var model = parseGLB(buf); setup(model); resize();
        return model.image ? createImageBitmap(model.image) : null;
      })
      .then(function (bmp) { if (disposed) return; if (bmp) uploadTexture(bmp); el.classList.add('is-3d'); wake(); })
      .catch(function (err) { console.warn('[BrewLatte3D] falling back to image:', err); canvas.remove(); el.classList.add('latte3d--failed'); });

    function destroy() {
      disposed = true; if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('lostpointercapture', onCancel); el.removeEventListener('pointerleave', onLeave);
      meshes.forEach(function (m) { m.bufs.forEach(function (b) { gl.deleteBuffer(b); }); gl.deleteVertexArray(m.vao); });
      if (shadowBuf) gl.deleteBuffer(shadowBuf); if (shadowVAO) gl.deleteVertexArray(shadowVAO);
      if (mark) { mark.bufs.forEach(function (b) { gl.deleteBuffer(b); }); gl.deleteVertexArray(mark.vao); if (mark.tex) gl.deleteTexture(mark.tex); mark = null; }
      if (tex) gl.deleteTexture(tex); if (prog) gl.deleteProgram(prog); if (sprog) gl.deleteProgram(sprog);
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      canvas.remove();
      el.classList.remove('is-3d', 'is-grabbing', 'is-moving'); el.style.touchAction = '';
    }

    return { destroy: destroy, settings: S, _state: st, _home: function () { return home.slice(); } };
  }

  window.BrewLatte3D = { mount: mount, defaults: DEFAULTS };

  function auto() {
    [].forEach.call(document.querySelectorAll('[data-latte-src]'), function (el) {
      if (!el._latte) el._latte = mount(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
