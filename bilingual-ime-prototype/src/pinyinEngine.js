import { dict } from "./vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320";

const keys = Object.keys(dict);

export function getPinyinCandidates(value, limit = 5) {
  const input = value.toLowerCase().replace(/[^a-z]/g, "");
  if (!input) return [];

  const matches = dict[input]
    ? dict[input]
    : keys.filter((key) => key.startsWith(input)).flatMap((key) => dict[key]);

  return [...new Set(
    matches
      .filter(Boolean)
      .sort((left, right) => right.f - left.f)
      .map((item) => item.w),
  )].slice(0, limit);
}
