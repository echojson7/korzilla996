/* Смена темы. Класс dark на <html> перекрашивает всё сразу, но каждый элемент с
   transition по цвету запустил бы свою анимацию (на витрине — около 500). Их
   доводят до конца в той же задаче: getAnimations() считает стиль один раз, и
   переходы сразу стоят в конце. Класс, выключающий переходы на кадр, стоил бы
   второго пересчёта всей страницы, когда его снимают. */

export const isDark = () => document.documentElement.classList.contains("dark");

function apply(dark) {
  if (dark === isDark()) return dark;
  document.documentElement.classList.toggle("dark", dark);
  for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
  return dark;
}

/* «system» следит за темой ОС, пока не выбрали тёмную или светлую явно. */
let scheme = null;
const follow = (event) => apply(event.matches);

export function setTheme(theme) {
  scheme ??= matchMedia("(prefers-color-scheme: dark)");
  scheme.removeEventListener("change", follow);
  if (theme === "system") scheme.addEventListener("change", follow);
  return apply(theme === "dark" || (theme === "system" && scheme.matches));
}

export const toggleTheme = () => setTheme(isDark() ? "light" : "dark");

/* Плотность: «medium» — шкала по умолчанию (основной контрол 36), «large» —
   крупный режим. Атрибут data-density на <html>, токены — tokens.css. */
export const getDensity = () => (document.documentElement.dataset.density === "large" ? "large" : "medium");

export function setDensity(density) {
  const large = density === "large";
  if (large === (getDensity() === "large")) return getDensity();
  if (large) document.documentElement.dataset.density = "large";
  else delete document.documentElement.dataset.density;
  for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
  return getDensity();
}
