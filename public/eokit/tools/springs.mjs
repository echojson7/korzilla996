/* Пружины кита: кривые linear() для tokens.css (--ui-spring*) и для springEasing
   в core/motion.js. Запуск: node eokit/tools/springs.mjs — печатает токены.

   Пружина задаётся как в SwiftUI: response — время одного качания (чем меньше,
   тем резче), bounce — доля перелёта (0 — без него). Длительность (-time) — время,
   за которое отклонение падает ниже 0,2 %: дальше глаз разницы не видит. */

import { springEasing } from "../core/motion.js";

const SPRINGS = {
  "--ui-spring": { response: 0.3, bounce: 0.18 },
  "--ui-spring-bounce": { response: 0.34, bounce: 0.3 },
  "--ui-spring-smooth": { response: 0.32, bounce: 0 },
  "--ui-spring-press": { response: 0.26, bounce: 0.38 },
  "--ui-spring-snap": { response: 0.2, bounce: 0.22 },
  "--ui-spring-fast": { response: 0.24, bounce: 0.18 },
};

for (const [name, config] of Object.entries(SPRINGS)) {
  const { easing, duration } = springEasing(config);
  console.log(`  ${name}: ${easing};`);
  console.log(`  ${name}-time: ${duration}ms;`);
}
