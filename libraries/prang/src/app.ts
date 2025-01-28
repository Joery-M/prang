import { createApp, type App } from 'vue';

export function bootstrapComponent(rootComponent: any, mountPoint: string) {
    const app = createApp(new rootComponent());
    app.mount(mountPoint);
}
