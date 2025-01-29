import {
    BindingTypes,
    ConstantTypes,
    createCompilerError,
    createCompoundExpression,
    createObjectProperty,
    createSimpleExpression,
    ElementTypes,
    ErrorCodes,
    hasScopeRef,
    IS_REF,
    isMemberExpression,
    isSimpleIdentifier,
    isStaticExp,
    NodeTypes,
    type DirectiveTransform,
    type ExpressionNode,
    type Property
} from '@vue/compiler-core';

const camelizeRE = /-(\w)/g;
const camelize = (str: string) => {
    return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
};

export const transformModel: DirectiveTransform = (dir, node, context) => {
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
        bindingType === BindingTypes.SETUP_MAYBE_REF;

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
    const eventArg = context.isTS ? `($event: any)` : `$event`;
    if (maybeRef) {
        if (bindingType === BindingTypes.SETUP_REF) {
            // v-model used on known ref.
            assignmentExp = createCompoundExpression([
                `${eventArg} => ((`,
                createSimpleExpression(rawExp, false, exp.loc),
                `).value = $event)`
            ]);
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
        createObjectProperty(propName, createCompoundExpression([dir.exp!, '.value'])),
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
