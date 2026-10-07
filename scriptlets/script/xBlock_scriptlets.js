/// define-prop.js
/// world MAIN
/// dependency safe-self.fn
/// dependency proxy-apply.fn
/// dependency validate-constant.fn
function definePropFn(trusted, ownerMatch = '', propMatch = '', descMatch = '', target = '', constant = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(`${trusted ? 'trusted-' : ''}define-prop`, ownerMatch, propMatch, descMatch, target, constant);
    const isLogger = ownerMatch === '' && propMatch === '' && descMatch === '' && target === '' && constant === '';
    if ( isLogger && safe.logLevel === 0 ) { return; }
    const extraArgs = safe.parseVarargs(varargs);
    const propPattern = propMatch !== '' ? safe.initPattern(propMatch, { canNegate: true }) : null;
    const compileConditions = (matchStr) => {
        if ( matchStr === '' ) { return null; }
        const conditions = [];
        const tokens = safe.String_split.call(matchStr.trim(), /\s+/);
        for ( let i = 0; i < tokens.length; i++ ) {
            const token = tokens[i];
            if ( token === '' ) continue;
            const negated = token.startsWith('!');
            const raw = negated ? token.slice(1) : token;
            const colonIdx = raw.indexOf(':');
            if ( colonIdx !== -1 ) {
                const kind = raw.slice(0, colonIdx);
                const valStr = raw.slice(colonIdx + 1);
                if ( kind === 'prop' || kind === 'propVal' ) {
                    const secondColon = valStr.indexOf(':');
                    if ( secondColon !== -1 && kind === 'propVal' ) {
                        conditions.push({
                            kind: 'propVal',
                            key: valStr.slice(0, secondColon),
                            pat: safe.initPattern(negated ? `!${valStr.slice(secondColon + 1)}` : valStr.slice(secondColon + 1), { canNegate: true }),
                            needsTarget: true
                        });
                    } else {
                        conditions.push({ kind: 'prop', key: valStr, expect: !negated, needsTarget: true });
                    }
                } else {
                    conditions.push({ 
                        kind, 
                        pat: safe.initPattern(negated ? `!${valStr}` : valStr, { canNegate: true }), 
                        needsTarget: kind === 'type' 
                    });
                }
            } else {
                conditions.push({ kind: 'has', key: raw, expect: !negated, needsTarget: true });
            }
        }
        return conditions.length > 0 ? conditions : null;
    };
    const ownerConditions = compileConditions(ownerMatch);
    const descConditions = compileConditions(descMatch);
    let replacement, repFn, setFn;
    if ( isLogger === false ) {
        replacement = validateConstantFn(trusted, constant, extraArgs);
        repFn = typeof replacement === 'function' ? replacement : function() { return replacement; };
        setFn = typeof replacement === 'function' ? replacement : function(_v) {};
    }
    const getSafeTypeStr = (obj) => {
        if ( obj == null ) { return ''; }
        try {
            const typeStr = safe.Object_toString.call(obj);
            if ( typeStr === '[object Object]' ) {
                const proto = safe.Object.getPrototypeOf(obj);
                if ( proto && proto.constructor && typeof proto.constructor.name === 'string' ) {
                    return `[object ${proto.constructor.name}]`;
                }
            }
            return typeStr;
        } catch (e) { return ''; }
    };
    const matchConditions = (targetObj, conditions, isDesc = false) => {
        if ( conditions === null ) { return true; }
        if ( targetObj == null ) { return false; }
        let tObj = undefined;
        let tObjEvaluated = false;
        for ( let i = 0; i < conditions.length; i++ ) {
            const cond = conditions[i];
            if ( cond.needsTarget && tObjEvaluated === false ) {
                try { tObj = isDesc ? targetObj.value : targetObj; } catch(e) {}
                tObjEvaluated = true;
            }
            if ( cond.kind === 'type' ) {
                if ( safe.testPattern(cond.pat, getSafeTypeStr(tObj)) === false ) { return false; }
            } else if ( cond.kind === 'has' || cond.kind === 'prop' ) {
                let has = false;
                try { has = tObj != null && cond.key in tObj; } catch(e) {}
                if ( has !== cond.expect ) { return false; }
            } else if ( cond.kind === 'propVal' ) {
                let valStr = 'undefined';
                try {
                    if ( tObj != null && cond.key in tObj ) {
                        const val = tObj[cond.key];
                        valStr = typeof val === 'string' ? val : safe.String(val);
                    }
                } catch(e) { return false; }
                if ( safe.testPattern(cond.pat, valStr) === false ) { return false; }
            } else if ( isDesc ) {
                let str = null;
                try {
                    if ( cond.kind === 'get' ) {
                        str = typeof targetObj.get === 'function' ? safe.Function_toString(targetObj.get) : '';
                    } else if ( cond.kind === 'set' ) {
                        str = typeof targetObj.set === 'function' ? safe.Function_toString(targetObj.set) : '';
                    } else if ( cond.kind === 'gs' ) {
                        const gStr = typeof targetObj.get === 'function' ? safe.Function_toString(targetObj.get) : '';
                        const sStr = typeof targetObj.set === 'function' ? safe.Function_toString(targetObj.set) : '';
                        str = `${gStr} ${sStr}`;
                    }
                } catch(e) { str = ''; }
                if ( str !== null && safe.testPattern(cond.pat, str) === false ) { return false; }
            } else {
                return false;
            }
        }
        return true;
    };
    const modifyDesc = (desc) => {
        let isData = false, isAccessor = false, hasGet = false, hasSet = false;
        try { isData = 'value' in desc || 'writable' in desc; } catch(e) {}
        try { hasGet = 'get' in desc; hasSet = 'set' in desc; isAccessor = hasGet || hasSet; } catch(e) {}
        const actualTarget = target === '' ? (isAccessor ? 'gs' : 'value') : target;
        const newDesc = {};
        let modified = false;
        try { if ( 'configurable' in desc ) newDesc.configurable = desc.configurable; } catch(e) {}
        try { if ( 'enumerable' in desc ) newDesc.enumerable = desc.enumerable; } catch(e) {}
        try { if ( 'value' in desc ) newDesc.value = desc.value; } catch(e) {}
        try { if ( 'writable' in desc ) newDesc.writable = desc.writable; } catch(e) {}
        try { if ( 'get' in desc ) newDesc.get = desc.get; } catch(e) {}
        try { if ( 'set' in desc ) newDesc.set = desc.set; } catch(e) {}
        if ( actualTarget === 'value' ) {
            if ( isAccessor ) {
                delete newDesc.get;
                delete newDesc.set;
            }
            if ( 'value' in newDesc || isAccessor || target !== '' ) {
                newDesc.value = replacement;
                modified = true;
            }
        } else if ( actualTarget === 'get' || actualTarget === 'set' || actualTarget === 'gs' ) {
            if ( isData ) {
                delete newDesc.value;
                delete newDesc.writable;
            }
            if ( (actualTarget === 'get' || actualTarget === 'gs') && (hasGet || target !== '' || isData) ) {
                newDesc.get = repFn;
                modified = true;
            }
            if ( (actualTarget === 'set' || actualTarget === 'gs') && (hasSet || target !== '' || isData) ) {
                newDesc.set = setFn;
                modified = true;
            }
        }
        return modified ? newDesc : desc;
    };
    const getSafePropString = (prop) => {
        if ( typeof prop === 'string' ) { return prop; }
        if ( typeof prop === 'symbol' ) { return prop.toString(); }
        try { return safe.String(prop); } catch (e) { return null; }
    };
    const definePropertyHandler = (context) => {
        const { callArgs } = context;
        if ( callArgs.length < 3 ) { return context.reflect(); }
        const pStr = getSafePropString(callArgs[1]);
        if ( pStr === null ) { return context.reflect(); }
        if ( propPattern !== null && safe.testPattern(propPattern, pStr) === false ) { 
            return context.reflect(); 
        }
        const owner = callArgs[0];
        const desc = callArgs[2];
        if ( owner == null || desc == null || typeof desc !== 'object' ) { return context.reflect(); }
        if ( isLogger ) {
            safe.uboLog(logPrefix, `prop: ${pStr}\n\towner: ${getSafeTypeStr(owner)}`);
            return context.reflect();
        }
        if ( ownerConditions !== null && matchConditions(owner, ownerConditions, false) === false ) { return context.reflect(); }
        if ( descConditions !== null && matchConditions(desc, descConditions, true) === false ) { return context.reflect(); }
        const updatedDesc = modifyDesc(desc);
        if ( updatedDesc !== desc ) {
            callArgs[2] = updatedDesc;
            if ( safe.logLevel > 0 ) { safe.uboLog(logPrefix, `Modified descriptor for ${pStr}`); }
        }
        return context.reflect();
    };
    proxyApplyFn('Object.defineProperty', definePropertyHandler);
    proxyApplyFn('Reflect.defineProperty', definePropertyHandler);
    const getSafeOwnKeys = (obj) => {
        const keys = [];
        try {
            const k = safe.Object.keys(obj);
            for ( let i = 0; i < k.length; i++ ) { keys.push(k[i]); }
        } catch(e) {}
        try {
            if ( typeof safe.Object.getOwnPropertySymbols === 'function' ) {
                const syms = safe.Object.getOwnPropertySymbols(obj);
                for ( let i = 0; i < syms.length; i++ ) {
                    const sym = syms[i];
                    const symDesc = safe.Object_getOwnPropertyDescriptor(obj, sym);
                    if ( symDesc && symDesc.enumerable ) { keys.push(sym); }
                }
            }
        } catch(e) {}
        return keys;
    };
    proxyApplyFn('Object.defineProperties', (context) => {
        const { callArgs } = context;
        if ( callArgs.length < 2 ) { return context.reflect(); }
        const owner = callArgs[0];
        const props = callArgs[1];
        if ( owner == null || props == null ) { return context.reflect(); }
        const ownKeys = getSafeOwnKeys(props);
        if ( ownKeys.length === 0 ) { return context.reflect(); }
        let modified = false;
        let newProps = null; 
        let ownerMatched = null;
        for ( let i = 0; i < ownKeys.length; i++ ) {
            const prop = ownKeys[i];
            const pStr = getSafePropString(prop);
            if ( pStr === null ) { continue; }
            const matchProp = propPattern === null || safe.testPattern(propPattern, pStr);
            let desc;
            try { desc = props[prop]; } catch(e) { continue; }
            if ( desc == null || typeof desc !== 'object' ) {
                if ( newProps !== null ) { newProps[prop] = desc; }
                continue;
            }
            if ( isLogger ) {
                safe.uboLog(logPrefix, `prop: ${pStr}\n\towner: ${getSafeTypeStr(owner)}`);
                if ( newProps !== null ) { newProps[prop] = desc; }
                continue;
            }
            if ( matchProp ) {
                if ( ownerMatched === null ) {
                    ownerMatched = ownerConditions === null || matchConditions(owner, ownerConditions, false);
                }
                if ( ownerMatched && (descConditions === null || matchConditions(desc, descConditions, true)) ) {
                    const updatedDesc = modifyDesc(desc);
                    if ( updatedDesc !== desc ) {
                        if ( newProps === null ) {
                            newProps = {};
                            for ( let j = 0; j < i; j++ ) {
                                const prevProp = ownKeys[j];
                                try { newProps[prevProp] = props[prevProp]; } catch(e) {}
                            }
                        }
                        newProps[prop] = updatedDesc;
                        modified = true;
                        if ( safe.logLevel > 0 ) { safe.uboLog(logPrefix, `Modified descriptor for ${pStr}`); }
                        continue;
                    }
                }
            }
            if ( newProps !== null ) { newProps[prop] = desc; }
        }
        if ( modified ) { callArgs[1] = newProps; }
        return context.reflect();
    });
}

/// trusted-auto-click-element.js
/// world ISOLATED
/// dependency get-all-cookies.fn
/// dependency get-all-local-storage.fn
/// dependency lookup-elements.fn
/// dependency run-at-html-element.fn
/// dependency safe-self.fn
function trustedAutoClickElementFn(selectors = '', extraMatch = '', delay = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('trusted-auto-click-element', selectors, extraMatch, delay, ...varargs);
    const extraArgs = safe.parseVarargs(varargs);
    const isSpa = extraArgs.spa === 'true' || extraArgs.spa === true || extraArgs.spa === 1;
    const maxLoops = typeof extraArgs.count === 'number' ? safe.Math_max(0, extraArgs.count) : 1;
    const loopRest = typeof extraArgs.interval === 'number' ? safe.Math_max(0, extraArgs.interval) : 1000;
    const spaWait = typeof extraArgs.spaWait === 'number' ? safe.Math_max(0, extraArgs.spaWait) : 50;
    let currentTriggerId = 0;
    const validateExtraMatch = ((matchString) => {
        if ( typeof matchString !== 'string' || matchString.trim() === '' ) { 
            return () => true; 
        }
        const assertions = safe.String_split.call(matchString, ',').map(s => {
            const pos1 = s.indexOf(':');
            const s1 = pos1 !== -1 ? s.slice(0, pos1) : s;
            const not = s1.startsWith('!');
            const type = not ? s1.slice(1) : s1;
            const s2 = pos1 !== -1 ? s.slice(pos1 + 1).trim() : '';
            if ( s2 === '' ) { return; }
            const out = { not, type };
            if ( s2.startsWith('/') ) {
                out.re = safe.patternToRegex(s2);
            } else {
                const pos2 = s2.indexOf('=');
                const key = pos2 !== -1 ? s2.slice(0, pos2).trim() : s2;
                const value = pos2 !== -1 ? s2.slice(pos2 + 1).trim() : '';
                out.re = new safe.RegExp(`^${safe.escapeRegexChars(key)}=${safe.escapeRegexChars(value)}`);
            }
            return out;
        }).filter(details => details !== undefined);
        if ( assertions.length === 0 ) { return () => true; }
        return () => {
            const allCookies = assertions.some(o => o.type === 'cookie') ? getAllCookiesFn() : [];
            const allStorageItems = assertions.some(o => o.type === 'localStorage') ? getAllLocalStorageFn() : [];
            const allSessionItems = assertions.some(o => o.type === 'sessionStorage') ? getAllLocalStorageFn('sessionStorage') : [];
            const hasNeedle = (haystack, needle) => {
                const items = Array.isArray(haystack) ? haystack : (haystack && haystack.key !== undefined ? [haystack] : []);
                for ( const { key, value } of items ) {
                    if ( safe.RegExp_test(needle, `${key}=${value}`) ) { return true; }
                }
                return false;
            };
            for ( const { not, type, re } of assertions ) {
                if ( type === 'cookie' && hasNeedle(allCookies, re) === not ) { return false; }
                if ( type === 'localStorage' && hasNeedle(allStorageItems, re) === not ) { return false; }
                if ( type === 'sessionStorage' && hasNeedle(allSessionItems, re) === not ) { return false; }
            }
            return true;
        };
    })(extraMatch);
    const steps = (( ) => {
        if ( typeof selectors !== 'string' || selectors.trim() === '' ) { return []; }
        const parsed = /^[;|]/.test(selectors)
            ? safe.String_split.call(selectors.slice(1), selectors.charAt(0))
            : safe.String_split.call(selectors, ',');
        return parsed.reduce((out, a) => {
            a = a.trim();
            if ( a === '' ) { return out; }
            if ( /^\d+$/.test(a) ) {
                out.push(parseInt(a, 10));
            } else {
                out.push(a);
            }
            return out;
        }, []);
    })();
    if ( steps.length === 0 ) { return; }
    const clickDelay = parseInt(delay, 10) || 1;
    for ( let i = steps.length - 1; i > 0; i-- ) {
        if ( typeof steps[i] !== 'string' ) { continue; }
        if ( typeof steps[i - 1] !== 'string' ) { continue; }
        steps.splice(i, 0, clickDelay);
    }
    if ( steps.length === 1 && delay !== '' ) {
        steps.unshift(clickDelay);
    }
    if ( typeof steps.at(-1) !== 'number' ) {
        steps.push(11000); 
    }
    const timeout = steps.pop();
    const waitForTime = ms => new Promise(resolve => {
        if ( safe.logLevel > 1 ) { safe.uboLog(logPrefix, `Waiting for ${ms} ms`); }
        self.setTimeout(resolve, ms);
    });
    const processSequence = async (triggerId) => {
        if ( !validateExtraMatch() ) {
            if ( safe.logLevel > 0 ) { safe.uboLog(logPrefix, 'extraMatch failed, aborted'); }
            return false; 
        }
        const currentSteps = steps.slice();
        while ( currentSteps.length > 0 ) {
            if ( triggerId !== currentTriggerId ) { return false; }
            const step = currentSteps.shift();
            if ( step === undefined ) { break; }
            if ( typeof step === 'number' ) {
                await waitForTime(step);
                continue;
            }
            if ( step.startsWith('!') ) { continue; }
            if ( safe.logLevel > 1 ) { safe.uboLog(logPrefix, `Waiting for ${step}`); }
            const until = Date.now() + timeout;
            const elems = await lookupElementsFn(step, until);
            if ( triggerId !== currentTriggerId ) { return false; }
            if ( elems && elems.length !== 0 ) {
                elems[0].click(); 
                if ( safe.logLevel > 0 ) { safe.uboLog(logPrefix, `Clicked ${step}`); }
            } else {
                if ( safe.logLevel > 0 ) { safe.uboLog(logPrefix, `Timed out waiting on ${step}`); }
                break;
            }
        }
        return true;
    };
    const triggerSequence = async () => {
        const triggerId = ++currentTriggerId;
        let loopCount = 0;
        while ( maxLoops === 0 || loopCount < maxLoops ) {
            if ( triggerId !== currentTriggerId ) { break; }
            const shouldContinue = await processSequence(triggerId);
            if ( !shouldContinue || triggerId !== currentTriggerId ) { break; }
            loopCount++;
            if ( maxLoops !== 0 && loopCount >= maxLoops ) { break; }
            if ( loopRest > 0 ) { await waitForTime(loopRest); }
        }
    };
    const startProcess = () => {
        triggerSequence();
        if ( isSpa ) {
            let spaTriggerId = 0;
            const onNavigate = async () => {
                const id = ++spaTriggerId;
                await waitForTime(spaWait);
                if ( id === spaTriggerId ) { triggerSequence(); }
            };
            if ( self.navigation && typeof self.navigation.addEventListener === 'function' ) {
                safe.addEventListener.call(self.navigation, 'navigate', onNavigate);
            } else {
                safe.addEventListener.call(self, 'popstate', onNavigate);
                safe.addEventListener.call(self, 'hashchange', onNavigate);
            }
        }
    };
    runAtHtmlElementFn(startProcess);
}
