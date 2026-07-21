import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import LatinExt from "./Lora-Regular-latin-ext.woff2";
import Latin from "./Lora-Regular-latin.woff2";

export const LoraFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: LatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: Latin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
