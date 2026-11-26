/* Счётчики меню и общие выборки по задачам. */

import { computed } from "vue";
import { deals } from "./data";
import { myOpen, myOverdueCount, overdueAll } from "./tasks";

export const myOpenTasks = myOpen;
export const overdueTasks = overdueAll;
export const myOverdue = myOverdueCount;
export const newDeals = computed(() => deals.filter((one) => one.stage === "new").length);
