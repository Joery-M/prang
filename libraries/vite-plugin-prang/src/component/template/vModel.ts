import {
    BindingTypes,
    ConstantTypes,
    createCompilerError,
    createCompoundExpression,
    createObjectProperty,
    createSimpleExpression,
    DOMErrorCodes,
    ElementTypes,
    ErrorCodes,
    findDir,
    findProp,
    hasDynamicKeyVBind,
    hasScopeRef,
    IS_REF,
    isMemberExpression,
    isSimpleIdentifier,
    isStaticArgOf,
    isStaticExp,
    NodeTypes,
    V_MODEL_CHECKBOX,
    V_MODEL_DYNAMIC,
    V_MODEL_RADIO,
    V_MODEL_SELECT,
    V_MODEL_TEXT,
    type DirectiveTransform,
    type ExpressionNode,
    type Property
} from '@vue/compiler-dom';

const __DEV__ = true;

const camelizeRE = /-(\w)/g;
const camelize = (str: string) => {
    return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
};

const baseTransformModel: DirectiveTransform = (dir, node, context) => {
    const { exp, arg } = dir;
    if (!exp) {
        context.onError(createCompilerError(ErrorCodes.X_V_MODEL_NO_EXPRESSION, dir.loc));
        return createTransformProps();
    }

    // we assume v-model directives are always parsed
    // (not artificially created by a transform)
    const rawExp = exp.loc.source.trim();
    const expString = exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : rawExp;

    // im SFC <script setup> inline mode, the exp may have been transformed into
    // _unref(exp)
    const bindingType = context.bindingMetadata[rawExp];

    // check props
    if (bindingType === BindingTypes.PROPS || bindingType === BindingTypes.PROPS_ALIASED) {
        context.onError(createCompilerError(ErrorCodes.X_V_MODEL_ON_PROPS, exp.loc));
        return createTransformProps();
    }

    const maybeRef =
        bindingType === BindingTypes.SETUP_LET ||
        bindingType === BindingTypes.SETUP_REF ||
        bindingType === BindingTypes.SETUP_MAYBE_REF ||
        bindingType === BindingTypes.SETUP_SIGNAL;

    if (!expString.trim() || (!isMemberExpression(exp, context) && !maybeRef)) {
        context.onError(createCompilerError(ErrorCodes.X_V_MODEL_MALFORMED_EXPRESSION, exp.loc));
        return createTransformProps();
    }

    if (context.prefixIdentifiers && isSimpleIdentifier(expString) && context.identifiers[expString]) {
        context.onError(createCompilerError(ErrorCodes.X_V_MODEL_ON_SCOPE_VARIABLE, exp.loc));
        return createTransformProps();
    }

    const propName = arg ? arg : createSimpleExpression('modelValue', true);
    const eventName = arg
        ? isStaticExp(arg)
            ? `onUpdate:${camelize(arg.content)}`
            : createCompoundExpression(['"onUpdate:" + ', arg])
        : `onUpdate:modelValue`;

    let assignmentExp: ExpressionNode;
    let getExp: ExpressionNode | undefined;

    const eventArg = context.isTS ? `($event: any)` : `$event`;
    if (maybeRef) {
        if (bindingType === BindingTypes.SETUP_REF) {
            // v-model used on known ref.
            assignmentExp = createCompoundExpression([
                `${eventArg} => ((`,
                createSimpleExpression(rawExp, false, exp.loc),
                `).value = $event)`
            ]);
        } else if (bindingType === BindingTypes.SETUP_SIGNAL) {
            assignmentExp = createCompoundExpression([`${eventArg} => (`, exp, `.set($event))`]);
            getExp = createCompoundExpression([exp, '()'], exp.loc);
        } else {
            // v-model used on a potentially ref binding in <script setup> inline mode.
            // the assignment needs to check whether the binding is actually a ref.
            const altAssignment = bindingType === BindingTypes.SETUP_LET ? `${rawExp} = $event` : `null`;
            assignmentExp = createCompoundExpression([
                `${eventArg} => (${context.helperString(IS_REF)}(${rawExp}) ? (`,
                createSimpleExpression(rawExp, false, exp.loc),
                `).value = $event : ${altAssignment})`
            ]);
        }
    } else {
        assignmentExp = createCompoundExpression([`${eventArg} => ((`, exp, `) = $event)`]);
    }

    const props = [
        // modelValue: foo
        createObjectProperty(propName, getExp ?? dir.exp!),
        // "onUpdate:modelValue": $event => (foo = $event)
        createObjectProperty(eventName, assignmentExp)
    ];

    // cache v-model handler if applicable (when it doesn't refer any scope vars)
    if (
        context.prefixIdentifiers &&
        !context.inVOnce &&
        context.cacheHandlers &&
        !hasScopeRef(exp, context.identifiers)
    ) {
        props[1].value = context.cache(props[1].value);
    }

    // modelModifiers: { foo: true, "bar-baz": true }
    if (dir.modifiers.length && node.tagType === ElementTypes.COMPONENT) {
        const modifiers = dir.modifiers
            .map((m) => m.content)
            .map((m) => (isSimpleIdentifier(m) ? m : JSON.stringify(m)) + `: true`)
            .join(`, `);
        const modifiersKey = arg
            ? isStaticExp(arg)
                ? `${arg.content}Modifiers`
                : createCompoundExpression([arg, ' + "Modifiers"'])
            : `modelModifiers`;
        props.push(
            createObjectProperty(
                modifiersKey,
                createSimpleExpression(`{ ${modifiers} }`, false, dir.loc, ConstantTypes.CAN_CACHE)
            )
        );
    }

    return createTransformProps(props);
};

function createTransformProps(props: Property[] = []) {
    return { props };
}

export const transformModel: DirectiveTransform = (dir, node, context) => {
    const baseResult = baseTransformModel(dir, node, context);
    // base transform has errors OR component v-model (only need props)
    if (!baseResult.props.length || node.tagType === ElementTypes.COMPONENT) {
        return baseResult;
    }

    if (dir.arg) {
        console.log(dir);
        context.onError(createCompilerError(DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT, dir.arg.loc));
    }

    function checkDuplicatedValue() {
        const value = findDir(node, 'bind');
        if (value && isStaticArgOf(value.arg, 'value')) {
            context.onError(createCompilerError(DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE, value.loc));
        }
    }

    const { tag } = node;
    const isCustomElement = context.isCustomElement(tag);
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || isCustomElement) {
        let directiveToUse = V_MODEL_TEXT;
        let isInvalidType = false;
        if (tag === 'input' || isCustomElement) {
            const type = findProp(node, `type`);
            if (type) {
                if (type.type === NodeTypes.DIRECTIVE) {
                    // :type="foo"
                    directiveToUse = V_MODEL_DYNAMIC;
                } else if (type.value) {
                    switch (type.value.content) {
                        case 'radio':
                            directiveToUse = V_MODEL_RADIO;
                            break;
                        case 'checkbox':
                            directiveToUse = V_MODEL_CHECKBOX;
                            break;
                        case 'file':
                            isInvalidType = true;
                            context.onError(
                                createCompilerError(DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT, dir.loc)
                            );
                            break;
                        default:
                            // text type
                            __DEV__ && checkDuplicatedValue();
                            break;
                    }
                }
            } else if (hasDynamicKeyVBind(node)) {
                // element has bindings with dynamic keys, which can possibly contain
                // "type".
                directiveToUse = V_MODEL_DYNAMIC;
            } else {
                // text type
                __DEV__ && checkDuplicatedValue();
            }
        } else if (tag === 'select') {
            directiveToUse = V_MODEL_SELECT;
        } else {
            // textarea
            __DEV__ && checkDuplicatedValue();
        }
        // inject runtime directive
        // by returning the helper symbol via needRuntime
        // the import will replaced a resolveDirective call.
        if (!isInvalidType) {
            baseResult.needRuntime = context.helper(directiveToUse);
        }
    } else {
        context.onError(createCompilerError(DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT, dir.loc));
    }

    // native vmodel doesn't need the `modelValue` props since they are also
    // passed to the runtime as `binding.value`. removing it reduces code size.
    baseResult.props = baseResult.props.filter(
        (p) => !(p.key.type === NodeTypes.SIMPLE_EXPRESSION && p.key.content === 'modelValue')
    );

    return baseResult;
};
