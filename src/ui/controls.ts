/**
 * Parameter panel DOM construction + event binding.
 */

type SliderDef = {
  label: string;
  key: string;
  min: number;
  max: number;
  step: number;
  value: () => number;
  onChange: (v: number) => void;
};

type CheckboxDef = {
  label: string;
  key: string;
  value: () => boolean;
  onChange: (v: boolean) => void;
};

type ColorDef = {
  label: string;
  key: string;
  value: () => string;
  onChange: (v: string) => void;
};

export function createSlider(def: SliderDef, container: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'control-row';

  const label = document.createElement('label');
  label.textContent = def.label;
  label.htmlFor = `slider-${def.key}`;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'control-value';
  valueSpan.textContent = String(def.value());

  const input = document.createElement('input');
  input.type = 'range';
  input.id = `slider-${def.key}`;
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.value = String(def.value());

  row.appendChild(label);
  row.appendChild(valueSpan);
  row.appendChild(input);
  container.appendChild(row);

  return;
}

export function createCheckbox(def: CheckboxDef, container: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'control-row';

  const label = document.createElement('label');
  label.textContent = def.label;
  label.htmlFor = `check-${def.key}`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `check-${def.key}`;
  input.checked = def.value();

  row.appendChild(label);
  row.appendChild(input);
  container.appendChild(row);
}

export function createColorPicker(def: ColorDef, container: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'control-row';

  const label = document.createElement('label');
  label.textContent = def.label;
  label.htmlFor = `color-${def.key}`;

  const input = document.createElement('input');
  input.type = 'color';
  input.id = `color-${def.key}`;
  input.value = def.value();

  row.appendChild(label);
  row.appendChild(input);
  container.appendChild(row);
}

export function createFieldset(title: string, container: HTMLElement): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  fieldset.appendChild(legend);
  container.appendChild(fieldset);
  return fieldset;
}
