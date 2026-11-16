let draw = () => {};

export function setRenderer(fn) {
  draw = fn;
}

export function render() {
  draw();
}
