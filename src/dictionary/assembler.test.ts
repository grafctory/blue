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


import { describe, expect, it } from "vitest";
import { checkDictionary, mergeDictionary, narrowsDictionary } from "./assembler.js";
import { dictionary } from "./index.js";


describe("checkDictionary", () => {

	it("returns undefined for consistent constraints", async () => {

		expect(checkDictionary({ minLength: 3, maxLength: 10 })).toBeUndefined();
		expect(checkDictionary({ minLength: 5, maxLength: 5 })).toBeUndefined();
		expect(checkDictionary({})).toBeUndefined();

	});

	it("returns trace for minLength > maxLength", async () => {

		expect(checkDictionary({ minLength: 10, maxLength: 5 }))
			.toContainEqual(expect.stringContaining("{minLength/maxLength}"));

	});

	it("returns undefined when only one bound is specified", async () => {

		expect(checkDictionary({ minLength: 5 })).toBeUndefined();
		expect(checkDictionary({ maxLength: 10 })).toBeUndefined();

	});

	describe("hasLanguage/languageIn", () => {

		// a required range is satisfiable where some tag matches both it and an accepted range, that is where
		// either range is a prefix of the other, the wildcard overlapping every range

		it.each<[string, readonly string[], readonly string[]]>([
			["an identical range", ["en"], ["en"]],
			["a required range narrower than the accepted one", ["en"], ["en-US"]],
			["a required range wider than the accepted one", ["en-US"], ["en"]],
			["a range differing only in case", ["en"], ["EN-us"]],
			["a wildcard required range", ["fr"], ["*"]],
			["a wildcard accepted range", ["*"], ["en-US"]],
			["several ranges each overlapping one accepted range", ["en-GB", "fr", "de"], ["en", "fr"]]
		])("returns undefined for %s", async (_label, languageIn, hasLanguage) => {

			expect(checkDictionary({ languageIn, hasLanguage })).toBeUndefined();

		});

		it.each<[string, readonly string[], readonly string[]]>([
			["a disjoint range", ["fr"], ["en"]],
			["a range sharing only a string prefix", ["de"], ["deu"]],
			["sibling subtags", ["en-GB"], ["en-US"]],
			["one range among several unmatched", ["en", "fr"], ["en", "de"]]
		])("returns trace for %s", async (_label, languageIn, hasLanguage) => {

			expect(checkDictionary({ languageIn, hasLanguage }))
				.toContainEqual(expect.stringContaining("{hasLanguage/languageIn}"));

		});

		it("returns undefined when either constraint is missing or empty", async () => {

			expect(checkDictionary({ hasLanguage: ["en"] })).toBeUndefined();
			expect(checkDictionary({ languageIn: ["fr"] })).toBeUndefined();
			expect(checkDictionary({ languageIn: [], hasLanguage: ["en"] })).toBeUndefined();

		});

	});

});

describe("narrowsDictionary", () => {

	it("accepts an identical child", async () => {

		expect(narrowsDictionary(dictionary(), dictionary())).toBeUndefined();

	});

	it("accepts a child that tightens minLength", async () => {

		expect(narrowsDictionary(dictionary({ minLength: 5 }), dictionary())).toBeUndefined();

	});

	it("rejects a child that widens minLength", async () => {

		expect(narrowsDictionary(dictionary({ minLength: 1 }), dictionary({ minLength: 5 }))).toBeDefined();

	});

	it("accepts a child that tightens maxLength", async () => {

		expect(narrowsDictionary(dictionary({ maxLength: 5 }), dictionary({ maxLength: 10 }))).toBeUndefined();

	});

	it("rejects a child that widens maxLength", async () => {

		expect(narrowsDictionary(dictionary({ maxLength: 10 }), dictionary({ maxLength: 5 }))).toBeDefined();

	});

	it("rejects a child with a disjoint languageIn", async () => {

		expect(narrowsDictionary(
			dictionary({ languageIn: ["en"] }),
			dictionary({ languageIn: ["fr"] })
		)).toBeDefined();

	});

	it("accepts a child narrowing languageIn", async () => {

		expect(narrowsDictionary(
			dictionary({ languageIn: ["en"] }),
			dictionary({ languageIn: ["en", "fr"] })
		)).toBeUndefined();

	});

	it("rejects a child widening languageIn", async () => {

		// a range the parent omits would be intersected away, leaving the state wider than the shape admits

		expect(narrowsDictionary(
			dictionary({ languageIn: ["en", "fr"] }),
			dictionary({ languageIn: ["en"] })
		)).toBeDefined();

	});

	it("accepts a child adding required ranges", async () => {

		expect(narrowsDictionary(
			dictionary({ hasLanguage: ["en", "fr"] }),
			dictionary({ hasLanguage: ["en"] })
		)).toBeUndefined();

	});

	it("accepts a child inheriting required ranges", async () => {

		expect(narrowsDictionary(dictionary(), dictionary({ hasLanguage: ["en"] }))).toBeUndefined();

	});

	it("rejects a child dropping required ranges", async () => {

		expect(narrowsDictionary(
			dictionary({ hasLanguage: ["fr"] }),
			dictionary({ hasLanguage: ["en", "fr"] })
		)).toContainEqual(expect.stringContaining("{hasLanguage}"));

	});

	it("rejects a child narrowing languageIn below an inherited required range", async () => {

		expect(narrowsDictionary(
			dictionary({ languageIn: ["fr"] }),
			dictionary({ languageIn: ["en", "fr"], hasLanguage: ["en"] })
		)).toBeDefined();

	});

	it("accepts a child that inherits a unique-tagged parent", async () => {

		expect(narrowsDictionary(dictionary(), dictionary({ uniqueLang: true }))).toBeUndefined();

	});

	it("accepts a child that adds the arity constraint", async () => {

		expect(narrowsDictionary(dictionary({ uniqueLang: true }), dictionary())).toBeUndefined();

	});

	it("rejects a child that drops a unique-tagged parent", async () => {

		expect(narrowsDictionary(dictionary({ uniqueLang: false }), dictionary({ uniqueLang: true })))
			.toContainEqual(expect.stringContaining("{uniqueLang}"));

	});

});

describe("mergeDictionary", () => {

	describe("kind", () => {

		it("preserves kind as 'dictionary'", async () => {

			expect(mergeDictionary(dictionary(), dictionary()).kind).toBe("dictionary");

		});

	});

	describe("minLength", () => {

		it("inherits source minLength when target has none", async () => {

			expect(mergeDictionary(dictionary(), dictionary({ minLength: 5 })).minLength).toBe(5);

		});

		it("keeps target minLength when source has none", async () => {

			expect(mergeDictionary(dictionary({ minLength: 5 }), dictionary()).minLength).toBe(5);

		});

		it("keeps the tighter target minLength", async () => {

			expect(mergeDictionary(
				dictionary({ minLength: 10 }),
				dictionary({ minLength: 5 })
			).minLength).toBe(10);

		});

		it("rejects a widened target minLength", async () => {

			expect(() => mergeDictionary(
				dictionary({ minLength: 3 }),
				dictionary({ minLength: 5 })
			)).toThrow(RangeError);

		});

	});

	describe("maxLength", () => {

		it("inherits source maxLength when target has none", async () => {

			expect(mergeDictionary(dictionary(), dictionary({ maxLength: 100 })).maxLength).toBe(100);

		});

		it("keeps target maxLength when source has none", async () => {

			expect(mergeDictionary(dictionary({ maxLength: 100 }), dictionary()).maxLength).toBe(100);

		});

		it("keeps the tighter target maxLength", async () => {

			expect(mergeDictionary(
				dictionary({ maxLength: 50 }),
				dictionary({ maxLength: 100 })
			).maxLength).toBe(50);

		});

		it("rejects a widened target maxLength", async () => {

			expect(() => mergeDictionary(
				dictionary({ maxLength: 200 }),
				dictionary({ maxLength: 100 })
			)).toThrow(RangeError);

		});

	});

	describe("languageIn", () => {

		it("inherits source languageIn when target has none", async () => {

			expect(mergeDictionary(dictionary(), dictionary({ languageIn: ["en", "fr"] })).languageIn)
				.toEqual(["en", "fr"]);

		});

		it("keeps target languageIn when source has none", async () => {

			expect(mergeDictionary(dictionary({ languageIn: ["en", "fr"] }), dictionary()).languageIn)
				.toEqual(["en", "fr"]);

		});

		it("keeps a target languageIn narrowing source", async () => {

			expect(mergeDictionary(
				dictionary({ languageIn: ["en", "de"] }),
				dictionary({ languageIn: ["en", "fr", "de"] })
			).languageIn).toEqual(["en", "de"]);

		});

		it("rejects a target languageIn widening source", async () => {

			expect(() => mergeDictionary(
				dictionary({ languageIn: ["en", "fr", "de"] }),
				dictionary({ languageIn: ["en", "de", "it"] })
			)).toThrow(RangeError);

		});

		it("rejects disjoint sets", async () => {

			expect(() => mergeDictionary(
				dictionary({ languageIn: ["en"] }),
				dictionary({ languageIn: ["fr"] })
			)).toThrow(RangeError);

		});

	});

	describe("hasLanguage", () => {

		it("inherits source hasLanguage when target has none", async () => {

			expect(mergeDictionary(dictionary(), dictionary({ hasLanguage: ["en"] })).hasLanguage)
				.toEqual(["en"]);

		});

		it("keeps target hasLanguage when source has none", async () => {

			expect(mergeDictionary(dictionary({ hasLanguage: ["en"] }), dictionary()).hasLanguage)
				.toEqual(["en"]);

		});

		it("keeps a target hasLanguage adding to source", async () => {

			expect(mergeDictionary(
				dictionary({ hasLanguage: ["en", "fr"] }),
				dictionary({ hasLanguage: ["en"] })
			).hasLanguage).toEqual(["en", "fr"]);

		});

		it("rejects a target hasLanguage dropping source ranges", async () => {

			expect(() => mergeDictionary(
				dictionary({ hasLanguage: ["fr"] }),
				dictionary({ hasLanguage: ["en"] })
			)).toThrow(RangeError);

		});

	});

	describe("uniqueLang", () => {

		it("inherits a unique-tagged parent when the child omits it", async () => {

			expect(mergeDictionary(dictionary(), dictionary({ uniqueLang: true })).uniqueLang).toBe(true);

		});

		it("keeps the child arity when the parent omits it", async () => {

			expect(mergeDictionary(dictionary({ uniqueLang: true }), dictionary()).uniqueLang).toBe(true);

		});

		it("rejects a child that drops a unique-tagged parent", async () => {

			expect(() => mergeDictionary(
				dictionary({ uniqueLang: false }),
				dictionary({ uniqueLang: true })
			)).toThrow(RangeError);

		});

	});

	describe("post-merge validation", () => {

		it("rejects merged minLength > merged maxLength", async () => {

			expect(() => mergeDictionary(
				dictionary({ minLength: 10 }),
				dictionary({ maxLength: 5 })
			)).toThrow(RangeError);

		});

		it("accepts merged minLength equal to merged maxLength", async () => {

			const merged = mergeDictionary(dictionary({ minLength: 5 }), dictionary({ maxLength: 5 }));

			expect(merged.minLength).toBe(5);
			expect(merged.maxLength).toBe(5);

		});

		it("rejects merged hasLanguage no merged languageIn range could match", async () => {

			expect(() => mergeDictionary(
				dictionary({ hasLanguage: ["en"] }),
				dictionary({ languageIn: ["fr"] })
			)).toThrow(RangeError);

		});

	});

});
