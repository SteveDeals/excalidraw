import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import LatinExt from "./Inter-Regular-latin-ext.woff2";
import Latin from "./Inter-Regular-latin.woff2";

export const InterFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: LatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: Latin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
