// Закрытие по клику на подложку. Срабатывает, только если кнопку и нажали, и
// отпустили на самой подложке: выделение текста внутри панели, отпущенное
// снаружи, панель не закрывает. Использование: v-on="backdrop(() => close())".
export function backdrop(close: () => void) {
  let down = false;
  return {
    pointerdown(event: PointerEvent) {
      down = event.target === event.currentTarget;
    },
    click(event: MouseEvent) {
      const self = event.target === event.currentTarget;
      if (down && self) close();
      down = false;
    },
  };
}
