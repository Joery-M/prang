import { createApp } from '@vue/runtime-dom';

export function bootstrapComponent(rootComponent: any, mountPoint: string): void {
    const app = createApp(rootComponent);
    app.mount(mountPoint);
}
