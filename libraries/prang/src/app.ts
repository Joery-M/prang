import { createApp } from 'vue';

export function bootstrapComponent(rootComponent: any, mountPoint: string) {
    const app = createApp(rootComponent.comp());
    app.mount(mountPoint);
}
