/**
 * WebGL shader sources for GPU-accelerated paper rendering.
 *
 * These strings are compiled by the renderer. Keeping them in a dedicated
 * module keeps the rendering engine free of large inline GLSL blocks.
 */

/** Minimal full-screen triangle vertex shader. */
export const VERTEX_SHADER_SOURCE = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/** Fragment shader producing realistic paper texture, ruling lines, margins. */
export const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform float lineSpacing;
  uniform float margin;
  uniform vec3 lineColor;
  uniform float lineOpacity;
  uniform vec3 paperColor;
  uniform vec3 marginColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * valueNoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float fbmDomainWarped(vec2 p) {
    vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15),
                   fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.126));
    return fbm(p + 3.5 * r);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 pos = uv * resolution;

    // --- Paper base color with warm/cool variation ---
    float colorTemp = fbm(pos * 0.003) * 0.015 - 0.0075;
    vec3 warmTint = vec3(colorTemp, colorTemp * 0.5, -colorTemp * 0.3);
    vec3 paper = paperColor + warmTint;

    // --- Coarse paper structure (large blotches, fiber bundles) ---
    float coarseNoise = fbmDomainWarped(pos * 0.004) * 0.06 - 0.03;
    paper += vec3(coarseNoise);

    // --- Fine paper fiber texture ---
    float fineNoise1 = valueNoise(pos * 0.08) * 0.03 - 0.015;
    float fineNoise2 = valueNoise(pos * 0.25) * 0.015 - 0.0075;
    paper += vec3(fineNoise1 + fineNoise2);

    // --- Horizontal fiber directionality (laid paper effect) ---
    float laidLine = sin(pos.y * 0.8 + fbm(pos * 0.01) * 4.0) * 0.005;
    paper += vec3(laidLine);

    // --- Edge darkening (paper curl / shadow at borders) ---
    float edgeX = smoothstep(0.0, 30.0, pos.x) * smoothstep(0.0, 30.0, resolution.x - pos.x);
    float edgeY = smoothstep(0.0, 20.0, pos.y) * smoothstep(0.0, 20.0, resolution.y - pos.y);
    float edgeDarken = edgeX * edgeY;
    paper *= 0.94 + edgeDarken * 0.06;

    // --- Top edge subtle shadow (paper sits on surface) ---
    float topShadow = smoothstep(resolution.y, resolution.y - 15.0, pos.y) * 0.04;
    paper -= vec3(topShadow);

    // ---- Realistic lighting ------------------------------------------------
    // Vector from paper center (paper curled slightly toward the viewer).
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 center = vec3(0.5, 0.6, 0.0);

    // A soft directional key light from the top-left casts a gradual falloff
    // across the page (bright top-left, dimmer bottom-right) plus a cool
    // ambient fill from the opposite side.
    float dirLight = 0.82 + 0.24 * clamp(-ndc.x * 0.5 - ndc.y * 0.5, -1.0, 1.0);
    float falloffGrid = mix(1.08, 0.88, ndc.y * 0.5 + 0.5);      // vertical gradient
    float falloffSide = mix(1.05, 0.93, ndc.x * 0.5 + 0.5);      // horizontal gradient
    float ambient = 0.30 + 0.18 * (0.5 - ndc.x * 0.5);           // fill from the right

    // Subtle curvature: the page bows slightly, so the center catches more
    // light and the edges fall into a soft shadow.
    float bulge = 1.0 - smoothstep(0.0, 1.1, length((ndc - center.xy)) * 1.3);
    vec3 lighting = vec3(
      (dirLight + ambient) * falloffGrid * falloffSide,
      (dirLight + ambient) * falloffGrid * falloffSide,
      (dirLight + ambient * 0.9) * falloffGrid * falloffSide
    ) * (1.04 - 0.05 * bulge);

    // Paper curl occlusion near the borders: darker, slightly warmer shadow
    // close to the sheet edge.
    float curlX = smoothstep(28.0, 0.0, min(pos.x, resolution.x - pos.x)) * 0.5
                + smoothstep(18.0, 0.0, min(pos.y, resolution.y - pos.y)) * 0.5;
    lighting *= 1.0 - curlX * 0.16;

    paper *= lighting;

    // Specular sheen: a large, faint, soft highlight from the top-left plus a
    // tighter, cooler glint that fades toward the page bottom.
    vec2 sheen = ndc - vec2(-0.45, 0.55);
    float sheenFalloff = exp(-dot(sheen, sheen) * 1.1);
    vec2 glint = ndc - vec2(0.15, 0.35);
    float glintFalloff = exp(-dot(glint, glint) * 4.0);
    vec3 specular = vec3(1.0, 0.99, 0.96) * (0.09 * sheenFalloff)
                  + vec3(0.86, 0.92, 1.0) * (0.10 * glintFalloff);

    // Add a faint, warm bounce light along the bottom edge (light reflecting
    // back off the surface the paper rests on).
    float bounce = pow(clamp((ndc.y - 0.35) * 0.5 + 0.5, 0.0, 1.0), 2.0) * 0.03;
    specular += vec3(1.0, 0.92, 0.82) * bounce;

    paper += specular;
    // ------------------------------------------------------------------------

    // --- Subtle color temperature lift so the lit paper reads as warm paper ---
    paper = mix(paper, paper * vec3(1.02, 0.995, 0.965), 0.35);

    vec3 color = paper;

    // --- Margin zone ---
    float marginPx = margin;
    float marginSoft = 6.0;
    float marginProgress = smoothstep(marginPx - marginSoft, marginPx + marginSoft, pos.x);
    vec3 marginTint = mix(marginColor, paper, marginProgress);
    float marginAlpha = (1.0 - marginProgress) * 0.15;
    color = mix(color, marginTint, marginAlpha);

    // --- Margin line (vertical red line) ---
    float distToMargin = abs(pos.x - marginPx);
    float marginLineAlpha = 1.0 - smoothstep(0.0, 0.8, distToMargin);
    color = mix(color, marginColor * 0.8, marginLineAlpha * 0.65);

    // --- Ruling lines ---
    float lineThick = 0.8;
    float distToLine = mod(pos.y, lineSpacing);
    if (pos.y > lineSpacing * 0.5) {
      distToLine = min(distToLine, lineSpacing - distToLine);
    }
    float lineAlpha = 1.0 - smoothstep(0.0, lineThick, distToLine);
    float lineShadowAlpha = 1.0 - smoothstep(0.0, 2.0, abs(distToLine - lineThick * 0.5));
    vec3 lineWithShadow = mix(color, lineColor * 0.7, lineShadowAlpha * 0.03);
    color = mix(lineWithShadow, lineColor, lineAlpha * lineOpacity);

    // --- Final film grain ---
    float grain = (fbm(pos * 0.4) - 0.5) * 0.025;
    color += vec3(grain);

    // --- Clamp ---
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;
