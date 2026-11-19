/* Счётчики меню и общие выборки по задачам. */

import { computed } from "vue";
import { tasks, deals, isOpen, isOverdue, ME_ID } from "./data";

export const myOpenTasks = computed(() => tasks.filter((one) => one.owner === ME_ID && isOpen(one)));
export const overdueTasks = computed(() => tasks.filter(isOverdue));
export const myOverdue = computed(() => myOpenTasks.value.filter(isOverdue).length);
export const newDeals = computed(() => deals.filter((one) => one.stage === "new").length);
