import '@vue/compiler-core';

declare module '@vue/compiler-core' {
    export enum BindingTypes {
        /**
         * returned from data()
         */
        DATA = 'data',
        /**
         * declared as a prop
         */
        PROPS = 'props',
        /**
         * a local alias of a `<script setup>` destructured prop.
         * the original is stored in __propsAliases of the bindingMetadata object.
         */
        PROPS_ALIASED = 'props-aliased',
        /**
         * a let binding (may or may not be a ref)
         */
        SETUP_LET = 'setup-let',
        /**
         * a const binding that can never be a ref.
         * these bindings don't need `unref()` calls when processed in inlined
         * template expressions.
         */
        SETUP_CONST = 'setup-const',
        /**
         * a const binding that does not need `unref()`, but may be mutated.
         */
        SETUP_REACTIVE_CONST = 'setup-reactive-const',
        /**
         * a const binding that may be a ref.
         */
        SETUP_MAYBE_REF = 'setup-maybe-ref',
        /**
         * bindings that are guaranteed to be refs
         */
        SETUP_REF = 'setup-ref',
        /**
         * declared by other options, e.g. computed, inject
         */
        OPTIONS = 'options',
        /**
         * a literal constant, e.g. 'foo', 1, true
         */
        LITERAL_CONST = 'literal-const',
        /**
         * bindings that are guaranteed to be signals
         */
        SETUP_SIGNAL = 'setup-signal'
    }

    export interface PlainElementNode extends PlainElementNode {
        isControlFlow?: boolean;
    }
    export interface TemplateNode extends TemplateNode {
        isControlFlow?: boolean;
    }
}
