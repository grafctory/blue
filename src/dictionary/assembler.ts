/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Dictionary shape assembly.
 *
 * Builds the shape the factory states into the form its consumers read, and combines it with the one it overrides: a
 * shape admitting no value at all is rejected as it is built rather than when a value is first matched against it, and
 * an extension is held to the shape it refines before either is committed to.
 *
 * @module
 */

import { type Optional } from "@grafctory/core";
import { type TagRange } from "@grafctory/core/language";
import { immutable } from "@grafctory/core/values";
import { all, test, type Trace } from "@grafctory/core/trace";
import { reject } from "../value/assembler.js";
import { type DictionaryConstraints, type DictionaryShape } from "./index.js";


/**
 * Assembles a dictionary shape.
 *
 * Backs the factory the {@link dictionary!} module exposes: contradictory constraints are rejected as the shape is
 * built, so that a shape that exists admits at least one value.
 *
 * @typeParam U The per-tag arity the shape states, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link DictionaryConstraints constraints}
 *
 * @returns An immutable shape admitting the language maps the constraints bound
 *
 * @throws {@link @grafctory/core!TraceError | TraceError} Where the stated constraints contradict one another
 */
export function assemble<U extends undefined | boolean>(constraints: DictionaryConstraints): DictionaryShape & {
	readonly uniqueLang: U
} {

	const shape = immutable({

		kind: "dictionary",

		...constraints

	}) as DictionaryShape & { readonly uniqueLang: U }; // ;(cast) the factory signature fixes the stated arity

	reject("inconsistent dictionary shape constraints", checkDictionary(shape));

	return shape;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks a set of localised constraints for internal consistency.
 *
 * Reports the contradictions that would leave a shape admitting no value at all, so that a shape is rejected as it is
 * built rather than when a value is first matched against it.
 *
 * @param constraints The constraints to check
 *
 * @returns A trace of the inconsistencies found, or `undefined` where the constraints admit at least one value
 */
export function checkDictionary(constraints: DictionaryConstraints): Optional<Trace> {

	return all<DictionaryConstraints>(
		test(({ minLength, maxLength }) => {

			return minLength === undefined || maxLength === undefined || minLength <= maxLength || [
				`{minLength/maxLength} inconsistent bounds <${minLength}> > <${maxLength}>`
			];

		}),
		test(({ languageIn: accepted = [], hasLanguage: required = [] }) => {

			const unmatched = accepted.length === 0 ? []
				: required.filter(range => !accepted.some(admitted => overlaps(range, admitted)));

			return unmatched.length === 0 || [
				`{hasLanguage/languageIn} required ranges <${unmatched}> not matched by any accepted range`
			];

		})
	)(constraints);

}

/**
 * Tells whether a dictionary shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where it leaves neither
 * length bound wider, adds no language range the inherited shape omits, drops no required one, keeps its per-tag
 * arity, and yields a consistent set of merged constraints, so that the merged shape still admits some value.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsDictionary(target: DictionaryShape, source: DictionaryShape): Optional<Trace> {

	return narrows(target, source, merge(target, source));

}

/**
 * Merges a dictionary shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against, combining the inherited constraints with the
 * overriding ones: length bounds accumulate, the accepted language ranges intersect, the required ones add up, and
 * `uniqueLang` carries through from whichever shape states it, so that an arity the parent fixes is never lost.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the language maps both `target` and `source` admit
 *
 * @throws {@link @grafctory/core!TraceError | TraceError} Where `target` doesn't narrow `source`
 */
export function mergeDictionary(target: DictionaryShape, source: DictionaryShape): DictionaryShape {

	const merged = merge(target, source);

	reject("incompatible dictionary shape override", narrows(target, source, merged));

	return immutable({

		kind: "dictionary",

		...merged

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports the obstacles standing against a dictionary shape override.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 * @param merged The constraints the two shapes combine into
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
function narrows(target: DictionaryShape, source: DictionaryShape, merged: DictionaryConstraints): Optional<Trace> {

	const { languageIn: accepted, hasLanguage: required = [] } = source;

	return all<DictionaryShape>(
		test(({ uniqueLang }) => {

			return uniqueLang !== false || source.uniqueLang !== true || [
				`{uniqueLang} dropped unique language constraint`
			];

		}),
		test(({ minLength }) => {

			return minLength === undefined || source.minLength === undefined || minLength >= source.minLength || [
				`{minLength} widened limit <${minLength}> beyond <${source.minLength}>`
			];

		}),
		test(({ maxLength }) => {

			return maxLength === undefined || source.maxLength === undefined || maxLength <= source.maxLength || [
				`{maxLength} widened limit <${maxLength}> beyond <${source.maxLength}>`
			];

		}),
		test(({ languageIn }) => {

			// a range the parent omits would be intersected away, leaving the state wider than the shape admits,
			// so a widened set is rejected outright as with the bounds

			const unexpected = languageIn === undefined || accepted === undefined ? []
				: languageIn.filter(v => !accepted.includes(v));

			return unexpected.length === 0 || [
				`{languageIn} unexpected ranges [${unexpected}]`
			];

		}),
		test(({ hasLanguage }) => {

			const missing = hasLanguage === undefined ? [] : required.filter(v => !hasLanguage.includes(v));

			return missing.length === 0 || [
				`{hasLanguage} missing required ranges [${missing}]`
			];

		}),
		() => checkDictionary(merged) // post-merge constraint consistency
	)(target);

}

/**
 * Combines the constraints of an overriding shape with the inherited ones.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns The merged constraints, as they stand before they are checked for consistency
 */
function merge(target: DictionaryShape, source: DictionaryShape): DictionaryConstraints {

	const { languageIn: accepted, hasLanguage: required } = source;

	return {

		// conjunctive: uniqueLang — added but never dropped

		uniqueLang: target.uniqueLang ?? source.uniqueLang,

		// conjunctive: lengths — the tighter bound

		minLength: target.minLength ?? source.minLength,
		maxLength: target.maxLength ?? source.maxLength,

		// conjunctive: languageIn — intersection

		languageIn: target.languageIn !== undefined && accepted !== undefined
			? target.languageIn.filter(v => accepted.includes(v))
			: target.languageIn ?? accepted,

		// conjunctive: hasLanguage — union

		hasLanguage: target.hasLanguage !== undefined && required !== undefined
			? [...new Set([...target.hasLanguage, ...required])]
			: target.hasLanguage ?? required

	};

}

/**
 * Tells whether two basic language ranges may be matched by a single tag.
 *
 * Either range may be the wildcard or a subtag prefix of the other, so `en` overlaps `en-US` but `de` misses `deu`.
 */
function overlaps(x: TagRange, y: TagRange): boolean {

	const [a, b] = [x.toLowerCase(), y.toLowerCase()];

	return a === "*" || b === "*" || a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);

}
