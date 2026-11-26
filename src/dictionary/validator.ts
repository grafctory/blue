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
 * Dictionary value validation.
 *
 * Holds a value to what a dictionary shape admits and reports everything wrong with it at once, keyed by the tag at
 * fault, so that a caller may tell which language failed and why.
 *
 * @module
 */

import { isArray, isObject, isString, opt as fold, type Optional } from "@grafctory/core";
import { isTag, isTagRange, matchTag, type Tag } from "@grafctory/core/language";
import { all, array, fail, length, object, pass, test, type Trace, type Validator } from "@grafctory/core/trace";
import { isAtomic } from "@grafctory/qest/model";
import type { Scope } from "../value/validator.js";
import { type DictionaryShape } from "./index.js";


/**
 * Validates values against a dictionary shape.
 *
 * Reports a value that is not a language map as a `{kind}` violation, and each entry that breaks a constraint under
 * its own facet, keyed by the tag it is stated under, so that a caller may tell which language failed and why. A tag
 * carries a single string where the shape states
 * {@link dictionary!DictionaryConstraints.uniqueLang | uniqueLang} and an array of strings otherwise; a value stated at
 * the other arity is rejected as a malformed map rather than as a broken constraint.
 *
 * A required language with no entry in any map is reported against the value set as a whole, since no tag carries it.
 * The set fails such a constraint even when empty, so a member requiring languages must always carry a map.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A `"model"`
 *     placeholder asks for the text either coalesced, as the atomic placeholder, or per tag, as a map of the language
 *     ranges wanted. The map is keyed by range, the `*` wildcard included, where a value is keyed by tag
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateDictionary(values: readonly unknown[], shape: DictionaryShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	switch ( scope ) {

		case "state":

			return state(shape)(values);

		case "model":

			return model()(values);

	}


	function state({

		uniqueLang,

		minLength,
		maxLength,

		languageIn,
		hasLanguage

	}: DictionaryShape): Validator<readonly unknown[]> {

		return all(

			covers(uniqueLang, hasLanguage),

			array((value: unknown) => !isObject(value) ? ["{kind} expected <dictionary> value"]

				: object(([tag, text]: readonly [string, unknown]) => !isTag(tag) ? [{ [tag]: ["invalid tag"] }]
					: fold(entry(tag, text), trace => [{ [tag]: trace }])
				)(value)

			)

		);


		/**
		 * Holds the content of a tag to the stated arity, then to the length and language constraints; content stated
		 * at the other arity is rejected as malformed rather than as a broken constraint.
		 */
		function entry(tag: Tag, text: unknown): Optional<Trace> {

			return uniqueLang === true

				? isString(text)
					? all(length(minLength, maxLength), accepts(tag, languageIn))(text)
					: ["expected string value"]

				: isArray<string>(text, isString)
					? all(array(length(minLength, maxLength)), accepts(tag, languageIn))(text)
					: ["expected string array value"];

		}

	}

	/**
	 * The form alone: a localised member is asked for coalesced, as the atomic placeholder, or structurally, as a map
	 * naming the tag ranges wanted. Per-tag arity follows the shape, so a map entry asks for the value and no more.
	 */
	function model(): Validator<readonly unknown[]> {

		return array((value: unknown) => isAtomic(value) ? undefined

			: !isObject(value) ? ["{kind} expected <Atomic> or <Locale> placeholder"]

				: object(([range, asked]: readonly [string, unknown]) =>
					!isTagRange(range) ? [{ [range]: ["invalid tag range"] }]
						: isAtomic(asked) ? undefined
							: [{ [range]: ["{type} expected <Atomic> value"] }]
				)(value)

		);

	}


	/**
	 * Requires every listed range to be matched by a tag carrying content at the stated arity, in any map of the set.
	 * Absent values and empty maps match nothing, so a violation concerns the whole set and leads the report.
	 */
	function covers(
		uniqueLang: undefined | boolean,
		hasLanguage: Optional<readonly string[]>
	): Validator<readonly unknown[]> {

		return test(values => {

			const tags = values.filter(value => isObject(value)).flatMap(map => Object.entries(map)
				.filter(([tag, text]) => isTag(tag) && (uniqueLang === true ? isString(text)
					: isArray<string>(text, isString) && text.length > 0
				))
				.map(([tag]) => tag)
			);

			const unmatched = (hasLanguage ?? []).filter(range => !tags.some(tag => matchTag(tag, range)));

			return unmatched.length === 0 || [
				`{hasLanguage} missing entries for required ranges [${unmatched.join(", ")}]`
			];

		});

	}

	function accepts(tag: Tag, languageIn: Optional<readonly string[]>): Validator<unknown> {

		return languageIn === undefined || languageIn.some(range => matchTag(tag, range)) ? pass
			: fail([`{languageIn} unsupported tag for allowed languages [${languageIn.join(", ")}]`]);

	}

}
