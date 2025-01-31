import { createApp } from 'vue';

export function bootstrapComponent(rootComponent: any, mountPoint: string) {
    const app = createApp(rootComponent);
    app.mount(mountPoint);
}
