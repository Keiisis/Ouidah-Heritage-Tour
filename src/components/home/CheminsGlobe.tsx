"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { pointSubsolaire } from "@/lib/soleil";
import { attendreOuverture } from "@/lib/ouverture";

// La Terre en ce moment (textures NASA Blue Marble et Black Marble, domaine public) : jour et nuit calculés pour
// l'heure exacte, halo d'atmosphère, lieux de Ouidah en grains de lumière, arc depuis la ville du visiteur.
// Le contexte graphique est créé une seule fois : la ville du visiteur, le format d'écran ou le mouvement réduit
// mettent à jour la scène sur place. Si le navigateur refuse la 3D, une image fixe de la Terre prend le relais.
type Pt = [number, number]; // [longitude, latitude]

const TEXTURES = { jour: "/terre/jour.jpg", nuit: "/terre/nuit.jpg" };
const SECOURS = "/terre/globe-secours.webp"; // la même Terre rendue d'avance, fond transparent ; le halo occupe 97,85 % du côté
const ARRIVEE = 2400; // ms : la Terre tourne jusqu'à Ouidah, l'arc se trace

type Reglage = { visiteur: Pt | null; large: boolean; reduit: boolean };

export function CheminsGlobe({ ouidah, lieux, visiteur, large, reduit, libelleOuidah, libelleVisiteur }: { ouidah: Pt; lieux: Pt[]; visiteur: Pt | null; large: boolean; reduit: boolean; libelleOuidah: string; libelleVisiteur: string | null }) {
  const boite = useRef<HTMLDivElement>(null);
  const pinOuidah = useRef<HTMLSpanElement>(null);
  const pinVisiteur = useRef<HTMLSpanElement>(null);
  const regler = useRef<((r: Reglage) => void) | null>(null);
  const [prete, setPrete] = useState(false);
  const [secours, setSecours] = useState(false);

  // création unique de la scène
  useEffect(() => {
    let annule = false;
    let nettoyer = () => {};
    (async () => {
      const el = boite.current;
      if (!el) return;
      try {
        await attendreOuverture(); // pas pendant l'ouverture : elle garde toutes les images
        const THREE = await import("three");
        if (annule) return;
        const r3 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        r3.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r3.domElement.setAttribute("aria-hidden", "true");
        r3.domElement.style.position = "absolute";
        r3.domElement.style.inset = "0";
        el.prepend(r3.domElement);
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
        const vec = ([lon, lat]: Pt, r = 1) => {
          const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
          return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
        };
        const charge = new THREE.TextureLoader();
        const [jour, nuit] = await Promise.all([charge.loadAsync(TEXTURES.jour), charge.loadAsync(TEXTURES.nuit)]);
        if (annule) {
          jour.dispose();
          nuit.dispose();
          r3.dispose();
          r3.domElement.remove();
          return;
        }
        [jour, nuit].forEach((t) => (t.anisotropy = r3.capabilities.getMaxAnisotropy()));
        const soleil = { value: vec(pointSubsolaire(new Date())).normalize() };
        const terre = new THREE.Mesh(
          new THREE.SphereGeometry(1, 128, 128),
          new THREE.ShaderMaterial({
            uniforms: { jour: { value: jour }, nuit: { value: nuit }, soleil },
            vertexShader: "varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
            // côté nuit : lumières des villes et silhouette très légère des continents ; côté jour : la Terre éclairée
            fragmentShader: `uniform sampler2D jour; uniform sampler2D nuit; uniform vec3 soleil; varying vec2 vUv; varying vec3 vN;
              void main(){ float l = dot(normalize(vN), soleil); float t = smoothstep(-0.1, 0.16, l);
                vec3 d = texture2D(jour, vUv).rgb; vec3 n = texture2D(nuit, vUv).rgb;
                gl_FragColor = vec4(mix(n * 1.25 + d * 0.07 + vec3(0.01, 0.016, 0.04), d * (0.62 + 0.5 * max(l, 0.)), t), 1.); }`,
          }),
        );
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(1.04, 96, 96),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false,
            vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
            fragmentShader: "varying vec3 vN; void main(){ float f = pow(0.72 - dot(vN, vec3(0., 0., 1.)), 3.); gl_FragColor = vec4(0.55, 0.72, 0.95, clamp(f, 0., 1.) * 0.55); }",
          }),
        );
        const g = new THREE.Group();
        g.add(terre);
        scene.add(g, halo);
        for (const p of lieux) {
          const grain = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          grain.position.copy(vec(p, 1.003));
          g.add(grain);
        }
        const arcMat = new THREE.MeshBasicMaterial({ color: 0xfdbf28 });
        let arc: InstanceType<typeof THREE.Mesh> | null = null;
        let vis: Pt | null = null;
        const centre = new THREE.Vector3();
        g.rotation.order = "YXZ";
        g.rotation.x = THREE.MathUtils.degToRad(24);

        // étiquettes HTML posées sur le point projeté, masquées quand le point passe derrière la Terre
        let W = 0, H = 0;
        const placer = (span: HTMLSpanElement | null, p: Pt | null) => {
          if (!span) return;
          if (!p) return void (span.style.visibility = "hidden");
          const monde = vec(p, 1.01).applyMatrix4(g.matrixWorld);
          const face = monde.clone().sub(centre).dot(monde.clone().sub(cam.position)) < 0;
          const ecran = monde.clone().project(cam);
          span.style.left = ((ecran.x + 1) / 2) * W + "px";
          span.style.top = ((1 - ecran.y) / 2) * H + "px";
          span.style.visibility = face ? "visible" : "hidden";
        };
        const rendre = (rot: number, trace = 1) => {
          g.rotation.y = rot;
          g.updateMatrixWorld();
          if (arc) arc.geometry.setDrawRange(0, Math.floor((arc.geometry.index?.count ?? 0) * trace));
          r3.render(scene, cam);
          placer(pinOuidah.current, ouidah);
          placer(pinVisiteur.current, vis);
        };
        const poser = () => {
          W = el.clientWidth;
          H = el.clientHeight;
          r3.setSize(W, H, false);
          r3.domElement.style.width = W + "px";
          r3.domElement.style.height = H + "px";
          cam.aspect = W / Math.max(1, H);
          cam.updateProjectionMatrix();
        };

        // réglage sur place : arc refait seulement si la ville change, la Terre tourne de sa position actuelle à la nouvelle
        let anim = 0;
        let deja = false;
        regler.current = ({ visiteur: v, large: lg, reduit: rd }) => {
          const nouvelArc = vis?.[0] !== v?.[0] || vis?.[1] !== v?.[1];
          if (nouvelArc) {
            if (arc) {
              g.remove(arc);
              arc.geometry.dispose();
              arc = null;
            }
            if (v) {
              const A = vec(v), B = vec(ouidah);
              const pts = Array.from({ length: 81 }, (_, i) => new THREE.Vector3().copy(A).lerp(B, i / 80).normalize().multiplyScalar(1.004 + 0.12 * Math.sin((Math.PI * i) / 80)));
              arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.005, 8), arcMat);
              g.add(arc);
            }
            vis = v;
          }
          // la Terre se tourne entre la ville du visiteur et Ouidah ; sur grand écran elle est décalée à droite,
          // ce qui fait déjà tourner la vue vers l'ouest : on compense
          const milieu = v ? Math.max(ouidah[0] - 40, Math.min(ouidah[0] + 40, (v[0] + ouidah[0]) / 2)) : ouidah[0];
          const cible = -Math.PI / 2 - THREE.MathUtils.degToRad(milieu + (lg ? 34 : 0));
          centre.set(lg ? 1.05 : 0, lg ? 0 : -0.55, 0);
          g.position.copy(centre);
          halo.position.copy(centre);
          cam.position.set(0, 0, lg ? 4 : 5.2);
          poser();
          cancelAnimationFrame(anim);
          // première arrivée : un tour d'élan ; ensuite, glissement court depuis la position actuelle ; un nouvel arc se trace
          const premiere = !deja;
          deja = true;
          if (rd) return rendre(cible);
          const depart = premiere ? cible + 0.7 : g.rotation.y;
          const duree = premiere ? ARRIVEE : 1200;
          const t0 = performance.now();
          const pas = (now: number) => {
            const t = Math.min(1, (now - t0) / duree);
            const e = 1 - (1 - t) ** 3;
            rendre(depart + (cible - depart) * e, premiere || nouvelArc ? e : 1);
            if (t < 1 && !annule) anim = requestAnimationFrame(pas);
          };
          anim = requestAnimationFrame(pas);
        };
        const ro = new ResizeObserver(() => {
          poser();
          rendre(g.rotation.y);
        });
        ro.observe(el);
        // contexte perdu (pilote, mémoire) : image fixe le temps que le navigateur le rende
        const perdu = (e: Event) => {
          e.preventDefault();
          setSecours(true);
        };
        const rendu = () => {
          setSecours(false);
          rendre(g.rotation.y);
        };
        r3.domElement.addEventListener("webglcontextlost", perdu);
        r3.domElement.addEventListener("webglcontextrestored", rendu);
        setPrete(true);
        nettoyer = () => {
          cancelAnimationFrame(anim);
          ro.disconnect();
          regler.current = null;
          r3.domElement.removeEventListener("webglcontextlost", perdu);
          r3.domElement.removeEventListener("webglcontextrestored", rendu);
          scene.traverse((o) => {
            const m = o as InstanceType<typeof THREE.Mesh>;
            m.geometry?.dispose();
            const mat = m.material as { dispose?: () => void } | undefined;
            mat?.dispose?.();
          });
          jour.dispose();
          nuit.dispose();
          r3.forceContextLoss(); // libère tout de suite le contexte au lieu d'attendre le ramasse-miettes
          r3.dispose();
          r3.domElement.remove();
        };
      } catch {
        // 3D refusée par le navigateur (contexte impossible à créer) ou textures indisponibles
        if (!annule) setSecours(true);
      }
    })();
    return () => {
      annule = true;
      nettoyer();
    };
  }, [ouidah, lieux]);

  // ville du visiteur, format d'écran, mouvement réduit : la scène existante est réglée, jamais recréée
  useEffect(() => {
    if (prete) regler.current?.({ visiteur, large, reduit });
  }, [prete, visiteur, large, reduit]);

  return (
    <div ref={boite} role="img" aria-label={libelleOuidah} className="absolute inset-0 [container-type:size]">
      {/* la même Terre rendue d'avance, à la même place : visible dès l'arrivée, le temps que la 3D se charge (three.js et
          ses textures), et quand la 3D est refusée ; jamais de grand vide blanc à la place du globe */}
      {secours || !prete ? (
        <div aria-hidden="true" className={`pointer-events-none absolute ${large ? "top-[-1.35cqh] left-[calc(50cqw-2.35cqh)] size-[102.7cqh]" : "top-[30.75cqh] left-[calc(50cqw-38.95cqh)] size-[77.9cqh]"}`}>
          <Image src={SECOURS} alt="" fill sizes="100vh" loading="eager" className="object-contain" />
        </div>
      ) : null}
      {secours ? null : (
        <>
          <span ref={pinOuidah} className={`pointer-events-none invisible absolute flex items-center gap-2 ${large ? "flex-row-reverse" : ""}`} style={{ transform: large ? "translate(calc(-100% + 7px), -50%)" : "translate(-7px, -50%)" }}>
            <span className="size-3.5 rounded-full bg-sun" />
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-abyss shadow-[0_10px_20px_-10px_color-mix(in_oklab,var(--surface-abyss)_45%,transparent)]">{libelleOuidah}</span>
          </span>
          {libelleVisiteur ? (
            <span ref={pinVisiteur} className="pointer-events-none invisible absolute flex items-center gap-2" style={{ transform: "translate(-6px, -50%)" }}>
              <span className="size-3 rounded-full bg-white" />
              <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-abyss shadow-[0_10px_20px_-10px_color-mix(in_oklab,var(--surface-abyss)_45%,transparent)]">{libelleVisiteur}</span>
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
