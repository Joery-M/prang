# Prang
**P**retty **R**eactive, **A**lmost a**NG**ular
(Im so good at names)

## What

A "framework" (if you will) that looks like Angular, smells like Angular, but is actually Vue.

Look in `libraries/playground` for the current testing setup.

## Features

- Components are defined as classes with a decorator
- PIPES!! (proud of this one)
- Angular style signals (actually Vue `shallowRef` under the hood)
- Built-in rxjs support (thanks vueuse!)
- Attribute binding with `[attr]="value"`
- Event binding with `(click)="clicked()"`
- Components can have `input`s and `output`s
- Inline templates and styles
- `viewChild()`

<br />

Directives with `*` syntax:
- `v-model="text"` > `*model="text"`
- `v-if="condition"` > `*if="condition"`

## Plans

- [ ] HMR for styles and templates
- [ ] 2 way binding
- [ ] `contentChild()`
- [ ] Template ref binding with `<comp #myComp />` (slot syntax will have to change)
- [ ] Services using decorator
- [ ] Directives using decorator
- [ ] NgModule equivalent

## Why

fun

Real reason: Got annoyed at the fact that Angular requires the Typescript compiler, meaning they can't use the amazing performance of Vite, esbuild or Rolldown (in the future). So I set out to make a version without Typescript.

Also, yes, I do realise that this has come full circle: Angular syntax inspired Vue, Vue tooling is used for this version of Angular.