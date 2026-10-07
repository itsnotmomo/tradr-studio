import { buildCaption, charCount, hashtagCount } from "./caption";
import { langInfo } from "./langs";
import { CAPTION_MAX, CAROUSEL_MAX, HASHTAG_MAX, RATIO_MAX, RATIO_MIN } from "./rules";
import type { Lang, LangSettings, Slide, Variant } from "./types";

const ratioOk = (s: Slide) => {
  const r = s.w / s.h;
  return r >= RATIO_MIN - 0.005 && r <= RATIO_MAX + 0.005;
};

/** Everything that would make Instagram reject this version. Empty = good to go. */
export function preflight(k: Lang, v: Variant, ls: LangSettings, connected: boolean) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const code = langInfo(k).code;
  if (!v.slides.length) problems.push("Add at least one slide before the Tradr slide.");
  if (!ls.tradrSlide) problems.push(`Upload the ${code} Tradr slide in Settings.`);
  const all = ls.tradrSlide ? [...v.slides, ls.tradrSlide] : v.slides;
  if (all.length > CAROUSEL_MAX) problems.push(`Instagram allows ${CAROUSEL_MAX} slides when posting through the API. This has ${all.length}.`);
  all.forEach((s, i) => {
    if (!ratioOk(s)) {
      const which = ls.tradrSlide && s.id === ls.tradrSlide.id ? "The Tradr slide" : `Slide ${i + 1}`;
      problems.push(`${which} is ${s.w}×${s.h}. Instagram needs a shape between 4:5 (portrait) and 1.91:1 (landscape).`);
    }
  });
  if (all.length > 1) {
    const first = all[0].w / all[0].h;
    if (all.some((s) => Math.abs(s.w / s.h - first) > 0.01)) warnings.push("Slides have different shapes. Instagram crops every slide to the shape of the first one.");
  }
  const cap = buildCaption(v);
  if (charCount(cap) > CAPTION_MAX) problems.push(`The caption is ${charCount(cap)} characters. The limit is ${CAPTION_MAX}.`);
  if (hashtagCount(cap) > HASHTAG_MAX) problems.push(`The caption has ${hashtagCount(cap)} hashtags. The limit is ${HASHTAG_MAX}.`);
  if (!connected) problems.push(`${langInfo(k).handle} isn't connected yet. Connect it in Settings.`);
  return { problems, warnings };
}
