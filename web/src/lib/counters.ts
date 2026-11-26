/* Счётчики меню и общие выборки по задачам. */

import { myOpen, myOverdueCount, overdueAll } from "./tasks";

export const myOpenTasks = myOpen;
export const overdueTasks = overdueAll;
export const myOverdue = myOverdueCount;
export { newDeals } from "./crm";
