'use strict';

/* eslint camelcase: [2, {properties: "never"}], quote-props: 0 */

var mockfs = require('mock-fs');
var _ = require('lodash');
var Handlebars = require('handlebars');
var path = require('path');
var tap = require('tap');

var rouxHandlebarsTools = require('../');
var getPartialDependencies =
	rouxHandlebarsTools.getPartialDependencies;

tap.test('getPartialDependencies', function (t) {
	t.autoend();

	t.test('arguments', function (t) {
		t.autoend();

		t.test('template', function (t) {
			t.throws(function () {
				getPartialDependencies();
			}, 'is required');

			_.forEach(
				[
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{}
				],
				function (arg) {
					t.throws(function () {
						getPartialDependencies(arg);
					}, 'must be a string');
				});
			t.end();
		});

		t.test('config', function (t) {
			t.doesNotThrow(function () {
				getPartialDependencies('');
			}, 'is optional');

			_.forEach(
				[
					'',
					'foo',
					0,
					123,
					true,
					false
				],
				function (arg) {
					t.throws(function () {
						resolve('', arg);
					}, 'must be an object, not ' + arg);
				});

			t.autoend();

			t.test('config.extensions', function (t) {
				t.doesNotThrow(function () {
					getPartialDependencies('', {}).catch(_.noop);
				}, 'is optional');

				_.forEach(
					[
						'',
						'foo',
						0,
						123,
						true,
						false,
						{}
					],
					function (arg) {
						t.throws(function () {
							getPartialDependencies('', {extensions: arg});
						}, 'must be an array, not ' + arg);
					});

				t.test('members are appended to partial paths', function (t) {
					var template = [
						'{{> a/partial }}',
						'{{> one/more/partial }}'
					].join('\n');

					mockfs({
						'a': {
							'partial.hbs': 'a/partial'
						},
						'one': {
							'more': {
								'partial.template': 'one/more/partial'
							}
						}
					});

					return getPartialDependencies(template, {
						extensions: ['hbs', 'template']
					})
					.then(function (map) {
						t.same(map, {
							'a/partial': path.resolve('a/partial.hbs'),
							'one/more/partial': path.resolve('one/more/partial.template')
						});
					})
					.finally(function () {
						mockfs.restore();
					});
				});

				t.test('defaults to ["hbs", "handlebars"]', function (t) {
					var template = [
						'{{> a/partial }}',
						'{{> one/more/partial }}'
					].join('\n');

					mockfs({
						'a': {
							'partial.hbs': 'a/partial'
						},
						'one': {
							'more': {
								'partial.handlebars': 'one/more/partial'
							}
						}
					});

					return getPartialDependencies(template)
						.then(function (map) {
							t.same(map, {
								'a/partial': path.resolve('a/partial.hbs'),
								'one/more/partial': path.resolve('one/more/partial.handlebars')
							});
						})
						.finally(function () {
							mockfs.restore();
						});
				});

				t.autoend();
			});

			t.test('config.pantries', function (t) {
				t.doesNotThrow(function () {
					getPartialDependencies('', {}).catch(_.noop);
				}, 'is optional');

				_.forEach(
					[
						'',
						'foo',
						0,
						123,
						true,
						false
					],
					function (arg) {
						t.throws(function () {
							getPartialDependencies('', {pantries: arg});
						}, 'must be an object, not ' + arg);
					});

				t.end();
			});

			t.test('config.partials', function (t) {
				t.doesNotThrow(function () {
					getPartialDependencies('', {}).catch(_.noop);
				}, 'is optional');

				_.forEach(
					[
						'',
						'foo',
						0,
						123,
						true,
						false
					],
					function (arg) {
						t.throws(function () {
							getPartialDependencies('', {partials: arg});
						}, 'must be an object, not ' + arg);
					});

				t.autoend();

				t.test('is not mutated', function (t) {
					var template =
						'this template uses {{> ./partials/one }}';
					var partials = {
						'./partials/one': './partials/one'
					};
					var partialsClone = _.clone(partials);

					return getPartialDependencies(template, {
						partials: partials
					})
					.then(function () {
						t.same(partials, partialsClone);
					});
				});

				t.test('members are processed if depended on by passed template',
					function (t) {
						var template =
							'this template uses {{> ./partials/one }}';

						mockfs({
							'node_modules': {
								'@retailmenot': {
									'pantry': {
										'one': {
											'ingredient.md': 'ingredient one',
											'index.hbs': 'which uses {{> @retailmenot/pantry/two }}'
										},
										'two': {
											'ingredient.md': 'ingredient two',
											'index.hbs': 'ingredient two'
										}
									}
								}
							}
						});

						return getPartialDependencies(template,
							{
								partials: {
									'./partials/one':
										'this template depends on {{> @retailmenot/pantry/one }}'
								}
							})
							.then(function (map) {
								t.match(map, {
									'@retailmenot/pantry/one':
										path.resolve(
											'node_modules/@retailmenot/pantry/one/index.hbs'),
									'@retailmenot/pantry/two':
										path.resolve(
											'node_modules/@retailmenot/pantry/two/index.hbs')
								});
							})
							.finally(function () {
								mockfs.restore();
							});
					});

				t.test('members are not included in the resulting dependency map',
					function (t) {
						var template =
							'this template uses {{> ./partials/one }}';

						return getPartialDependencies(template, {
							partials: {
								'./partials/one': './partials/one'
							}
						})
						.then(function (map) {
							t.same(map, {});
						});
					});
			});

			t.test('config.pantrySearchPaths', function (t) {
				t.doesNotThrow(function () {
					getPartialDependencies('', {}).catch(_.noop);
				}, 'is optional');

				_.forEach(
					[
						'',
						'foo',
						0,
						123,
						true,
						false,
						{}
					],
					function (arg) {
						t.throws(function () {
							getPartialDependencies('', {pantrySearchPaths: arg});
						}, 'must be an array, not ' + arg);
					});

				t.autoend();
			});

			t.test('config.partialSearchPaths', function (t) {
				t.doesNotThrow(function () {
					getPartialDependencies('', {}).catch(_.noop);
				}, 'is optional');

				_.forEach(
					[
						'',
						'foo',
						0,
						123,
						true,
						false,
						{}
					],
					function (arg) {
						t.throws(function () {
							getPartialDependencies('', {partialSearchPaths: arg});
						}, 'must be an array, not ' + arg);
					});

				t.autoend();
			});
		});
	});

	t.test('returns a Promise', function (t) {
		var promise = getPartialDependencies('');

		t.type(promise, 'object');
		t.type(promise.then, 'function');

		t.end();
	});

	t.test('empty template resolves to empty result', function (t) {
		return getPartialDependencies('')
			.then(function (map) {
				t.same(map, {}, 'the dependencies of an empty template are `{}`');
			});
	});

	t.test('template with no partials resolves to empty result', function (t) {
		return getPartialDependencies('this template has no partials, {{ok}}')
			.then(function (map) {
				t.same(map, {}, 'the dependencies of an empty template are `{}`');
			});
	});

	t.test('maps partials depended on by the passed template', function (t) {
		var template =
			'this template uses {{> ./partials/one }} and {{> ./partials/two }}';

		mockfs({
			'partials/one.hbs': 'partial one',
			'partials/two.hbs': 'partial two'
		});

		return getPartialDependencies(template)
			.then(function (map) {
				t.same(map, {
					'./partials/one': path.resolve('partials/one.hbs'),
					'./partials/two': path.resolve('partials/two.hbs')
				});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test('maps ingredients depended on by the passed template', function (t) {
		var template = 'this template uses {{> @retailmenot/pantry/one }} and ' +
			'{{> @retailmenot/pantry/two }}';

		mockfs({
			'node_modules': {
				'@retailmenot': {
					'pantry': {
						'one': {
							'ingredient.md': 'ingredient one',
							'index.hbs': 'ingredient one'
						},
						'two': {
							'ingredient.md': 'ingredient two',
							'index.hbs': 'ingredient two'
						}
					}
				}
			}
		});

		return getPartialDependencies(template, {})
			.then(function (map) {
				t.same(map, {
					'@retailmenot/pantry/one':
						path.resolve('node_modules/@retailmenot/pantry/one/index.hbs'),
					'@retailmenot/pantry/two':
						path.resolve('node_modules/@retailmenot/pantry/two/index.hbs')
				});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test('maps partials transitively depended on by the passed template',
		function (t) {
			var template =
				'this template uses {{> ./partials/one }}';

			mockfs({
				'partials/one.hbs': 'partials/one uses {{> ./partials/two }}',
				'partials/two.hbs': 'partials/two which uses {{> ./partials/three }}',
				'partials/three.hbs': 'partials/three'
			});

			return getPartialDependencies(template, {})
				.then(function (map) {
					t.same(map, {
						'./partials/one': path.resolve('partials/one.hbs'),
						'./partials/two': path.resolve('partials/two.hbs'),
						'./partials/three': path.resolve('partials/three.hbs')
					});
				})
				.finally(function () {
					mockfs.restore();
				});
		});

	t.test('maps ingredients transitively depended on by the passed template',
		function (t) {
			var template =
				'this template uses {{> ./partials/one }}';

			mockfs({
				'partials/one.hbs': 'partials/one uses {{> @retailmenot/pantry/one }}',
				'node_modules': {
					'@retailmenot': {
						'pantry': {
							'one': {
								'ingredient.md': 'ingredient one',
								'index.hbs': 'which uses {{> @retailmenot/pantry/two }}'
							},
							'two': {
								'ingredient.md': 'ingredient two',
								'index.hbs': 'ingredient two'
							}
						}
					}
				}
			});

			return getPartialDependencies(template, {})
				.then(function (map) {
					t.same(map, {
						'./partials/one': path.resolve('partials/one.hbs'),
						'@retailmenot/pantry/one':
							path.resolve('node_modules/@retailmenot/pantry/one/index.hbs'),
						'@retailmenot/pantry/two':
							path.resolve('node_modules/@retailmenot/pantry/two/index.hbs')
					});
				})
				.finally(function () {
					mockfs.restore();
				});
		});

	t.test('circular dependencies are tolerated', function (t) {
		var template = [
			'from config.partials {{> config-partial }}',
			'normal partial {{> ./normal-partial }}',
			'ingredient {{> @retailmenot/pantry/one }}'
		].join('\n');

		mockfs({
			'normal-partial.hbs': '{{> ./normal-partial-dep }}',
			'normal-partial-dep.hbs': '{{> ./normal-partial }}',
			'node_modules': {
				'@retailmenot': {
					'pantry': {
						'one': {
							'ingredient.md': 'ingredient one',
							'index.hbs': '{{> @retailmenot/pantry/two }}'
						},
						'two': {
							'ingredient.md': 'ingredient two',
							'index.hbs': '{{> @retailmenot/pantry/one }}'
						}
					}
				}
			}
		});

		return getPartialDependencies(template,
			{
				partials: {
					'config-partial': '{{> config-partial-dep }}',
					'config-partial-dep': '{{> config-partial }}'
				}
			})
			.then(function (map) {
				t.same(map, {
					'./normal-partial': path.resolve('normal-partial.hbs'),
					'./normal-partial-dep': path.resolve('normal-partial-dep.hbs'),
					'@retailmenot/pantry/one':
						path.resolve('node_modules/@retailmenot/pantry/one/index.hbs'),
					'@retailmenot/pantry/two':
						path.resolve('node_modules/@retailmenot/pantry/two/index.hbs')
				});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test('prefers filesystem templates to ingredients', function (t) {
		var template = [
			'{{> @retailmenot/pantry/one }}'
		].join('\n');

		mockfs({
			'@retailmenot': {
				'pantry': {
					'one.hbs': 'one/more/partial'
				}
			},
			'node_modules': {
				'@retailmenot': {
					'pantry': {
						'one': {
							'ingredient.md': 'ingredient one',
							'index.hbs': '@retailmenot/pantry/one'
						}
					}
				}
			}
		});

		return getPartialDependencies(template)
			.then(function (map) {
				t.same(map, {
					'@retailmenot/pantry/one':
						path.resolve('@retailmenot/pantry/one.hbs')
				});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test(
		'falls back to filesystem if partial cannot be resolved to an ingredient',
		function (t) {
			var template = [
				'{{> a/partial }}',
				'{{> one/more/partial }}'
			].join('\n');

			mockfs({
				'a': {
					'partial.hbs': 'a/partial'
				},
				'one': {
					'more': {
						'partial.hbs': 'one/more/partial'
					}
				}
			});

			return getPartialDependencies(template)
				.then(function (map) {
					t.same(map, {
						'a/partial': path.resolve('a/partial.hbs'),
						'one/more/partial': path.resolve('one/more/partial.hbs')
					});
				})
				.finally(function () {
					mockfs.restore();
				});
		});

	t.test('resolves non-entry-point templates inside an ingredient',
		function (t) {
			var template = [
				'{{> @retailmenot/pantry/one }}',
				'{{> another-pantry/one }}'
			].join('\n');

			mockfs({
				'node_modules': {
					'@retailmenot': {
						'pantry': {
							'one': {
								'ingredient.md': 'ingredient one',
								'index.hbs': '{{> @retailmenot/pantry/one/foo }}',
								'foo.hbs': 'foo'
							}
						}
					},
					'another-pantry': {
						'one': {
							'ingredient.md': 'ingredient one',
							'index.hbs': '{{> another-pantry/one/foo }}',
							'foo.hbs': 'foo'
						}
					}
				}
			});

			return getPartialDependencies(template)
				.then(function (map) {
					t.same(map, {
						'@retailmenot/pantry/one':
							path.resolve('node_modules/@retailmenot/pantry/one/index.hbs'),
						'@retailmenot/pantry/one/foo':
							path.resolve('node_modules/@retailmenot/pantry/one/foo.hbs'),
						'another-pantry/one':
							path.resolve('node_modules/another-pantry/one/index.hbs'),
						'another-pantry/one/foo':
							path.resolve('node_modules/another-pantry/one/foo.hbs')
					});
				})
				.finally(function () {
					mockfs.restore();
				});
		});

	t.test('resolves nested ingredients', function (t) {
		var template = [
			'{{> @retailmenot/pantry/nested/one }}'
		].join('\n');

		mockfs({
			'node_modules': {
				'@retailmenot': {
					'pantry': {
						'nested': {
							'one': {
								'ingredient.md': 'ingredient one',
								'index.hbs': '{{> @retailmenot/pantry/nested/one/foo }}',
								'foo.hbs': 'foo'
							}
						}
					}
				}
			}
		});

		return getPartialDependencies(template)
			.then(function (map) {
				t.same(map, {
					'@retailmenot/pantry/nested/one':
						path.resolve(
							'node_modules/@retailmenot/pantry/nested/one/index.hbs'),
					'@retailmenot/pantry/nested/one/foo':
						path.resolve('node_modules/@retailmenot/pantry/nested/one/foo.hbs')
				});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test('handles inline partials', t => {
		t.test('does not include inline partials in dependencies', t => {
			const template = `
				{{#*inline "hoo"}}
				{{/inline}}

				{{> hoo}}
			`;

			return getPartialDependencies(template)
				.then(dependencies => t.same(dependencies, {}));
		});

		t.test('detects dependencies of inline partials', t => {
			const template = `
				{{#*inline 'hoo'}}
					{{> boy }}
				{{/inline}}

				{{> hoo}}
			`;

			mockfs({
				'boy.hbs': 'dang'
			});

			return getPartialDependencies(template)
				.then(dependencies => t.same(dependencies, {
					boy: path.resolve('boy.hbs')
				}))
				.finally(function () {
					mockfs.restore();
				});
		});

		t.end();
	});

	t.test('ignores partial blocks', function (t) {
		var template = '{{> @partial-block }}';

		mockfs({});

		return getPartialDependencies(template)
			.then(function (map) {
				// expect an empty map
				t.same(map, {});
			})
			.finally(function () {
				mockfs.restore();
			});
	});

	t.test('ignores dynamic partials', t => {
		const template = '{{>(lookup . "ingredientName")}}';

		return getPartialDependencies(template)
			.then(map => {
				// expect no partials
				t.same(map, {});
			});
	});

	t.test('does not falsely read dynamic partial params as dynamic partials',
		t => {
			const template = '{{> heck dang=(rats)}}';

			mockfs({
				'heck.hbs': 'wow'
			});

			return getPartialDependencies(template)
				.then(dependencies => t.same(dependencies, {
					heck: path.resolve('heck.hbs')
				}))
				.finally(() => mockfs.restore());
		});
});

var registerPartial = rouxHandlebarsTools.registerPartial;

tap.test('registerPartial', (t) => {
	t.autoend();

	t.test('arguments', (t) => {
		t.autoend();

		t.test('name', (t) => {
			t.throws(() => {
				registerPartial();
			}, 'is required');

			_.forEach(
				[
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{}
				],
				arg => {
					t.throws(() => {
						registerPartial(arg);
					}, 'must be a string, not ' + JSON.stringify(arg));
				}
			);
			t.end();
		});

		t.test('templateSource', (t) => {
			t.throws(() => {
				registerPartial('');
			}, 'is required');

			_.forEach(
				[
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{}
				],
				arg => {
					t.throws(() => {
						registerPartial('', arg);
					}, 'must be a string, not ' + JSON.stringify(arg));
				}
			);
			t.end();
		});

		t.test('handlebarsEnv', (t) => {
			t.throws(() => {
				registerPartial('', '');
			}, 'is required');

			_.forEach(
				[
					'',
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{},
					function () {}
				],
				arg => {
					t.throws(() => {
						registerPartial('', arg);
					}, 'must be an instance of HandlebarsEnvironment, not ' +
						JSON.stringify(arg));
				}
			);

			t.doesNotThrow(() => {
				registerPartial('', '', Handlebars.create());
			}, 'accepts a HandlebarsEnvironment');
			t.end();
		});
	});

	t.test('returns a Promise', (t) => {
		var promise = registerPartial('', '', Handlebars.create());

		t.type(promise, 'object');
		t.type(promise.then, 'function');

		t.end();
	});

	t.test('accepts a nodeback', (t) => {
		registerPartial('', '', Handlebars.create(), () => {
			t.end();
		});
	});

	t.test('registers partials', (t) => {
		t.autoend();

		t.afterEach(() => {
			mockfs.restore();
		});

		t.test('with no dependencies', (t) => {
			var hbCtx = Handlebars.create();
			return registerPartial('hello', 'hello, world', hbCtx).then(obj => {
				t.strictSame(obj.name, 'hello');
				t.type(hbCtx.partials.hello, 'function');
				t.strictSame(obj.template(), 'hello, world');
				t.end();
			});
		});

		t.test('with simple dependencies', (t) => {
			mockfs({
				'name.hbs': 'it\'s me'
			});

			var hbCtx = Handlebars.create();
			return registerPartial('hello', 'hello, {{> name}}', hbCtx)
				.then(obj => {
					t.strictSame(obj.name, 'hello');
					t.type(hbCtx.partials.hello, 'function');
					t.type(hbCtx.partials.name, 'function');
					t.strictSame(obj.template(), 'hello, it\'s me');
					t.end();
				});
		});

		t.test('with transitive dependencies', (t) => {
			mockfs({
				'stuff/artist.hbs': 'me',
				'name.hbs': 'it\'s {{> stuff/artist}}'
			});

			var hbCtx = Handlebars.create();
			return registerPartial('hello', 'hello, {{> name}}', hbCtx)
				.then(obj => {
					t.strictSame(obj.name, 'hello');
					t.type(hbCtx.partials.hello, 'function');
					t.type(hbCtx.partials.name, 'function');
					t.type(hbCtx.partials['stuff/artist'], 'function');
					t.strictSame(obj.template(), 'hello, it\'s me');
					t.end();
				});
		});

		t.test('but not when options.registerTransitiveDependencies is false',
			(t) => {
				mockfs({
					'stuff/artist.hbs': 'me',
					'name.hbs': 'it\'s {{> stuff/artist}}'
				});

				var hbCtx = Handlebars.create();
				return registerPartial('hello', 'hello, {{> name}}', hbCtx, {
					registerTransitiveDependencies: false
				})
				.then(obj => {
					t.strictSame(obj.name, 'hello');
					t.type(hbCtx.partials.hello, 'function');
					t.notOk(hbCtx.partials.name);
					t.notOk(hbCtx.partials['stuff/artist']);
					t.throws(() => obj.template());
					t.end();
				});
			}
		);

		t.test('with pantry spec dependencies', (t) => {
			mockfs({
				'pantry/artist/info/index.hbs': '{{> artist/name}}',
				'pantry/artist/info/ingredient.md': '',
				'pantry/artist/name/index.hbs': 'it\'s {{artist}}',
				'pantry/artist/name/ingredient.md': ''
			});

			var hbCtx = Handlebars.create();
			return registerPartial('hello', 'hello, {{> artist/info}}', hbCtx, {
				dependencyOptions: {
					pantrySearchPaths: [path.join(process.cwd(), 'pantry')]
				}
			})
			.then(obj => {
				t.strictSame(obj.name, 'hello');
				t.type(hbCtx.partials.hello, 'function');
				t.type(hbCtx.partials['artist/info'], 'function');
				t.type(hbCtx.partials['artist/name'], 'function');
				t.strictSame(obj.template({artist: 'me'}), 'hello, it\'s me');
				t.end();
			});
		});

		t.test('but only registers each partial once', (t) => {
			var hbCtx = Handlebars.create();
			return registerPartial('hello', 'hello, it\'s me', hbCtx)
				.then(() => registerPartial('hello', 'hello, it\'s you', hbCtx))
				.then(obj => {
					t.strictSame(obj.name, 'hello');
					t.type(hbCtx.partials.hello, 'function');
					t.strictSame(obj.template(), 'hello, it\'s me');
					t.end();
				});
		});
	});
});

var registerPantry = rouxHandlebarsTools.registerPantry;
var Pantry = require('@retailmenot/roux/lib/pantry');
var resolvePantry = require('@retailmenot/roux').resolve;

tap.test('registerPantry', (t) => {
	t.autoend();

	t.test('arguments', (t) => {
		t.autoend();

		t.test('pantry', (t) => {
			t.throws(() => {
				registerPantry();
			}, 'is required');

			_.forEach(
				[
					'',
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{}
				],
				arg => {
					t.throws(() => {
						registerPantry(arg);
					}, 'must be an instance of Pantry, not ' + JSON.stringify(arg));
				}
			);
			t.end();
		});

		t.test('handlebarsEnv', (t) => {
			t.throws(() => {
				registerPantry(new Pantry({}));
			}, 'is required');

			_.forEach(
				[
					'',
					0,
					123,
					true,
					false,
					null,
					undefined,
					[],
					{},
					function () {}
				],
				arg => {
					t.throws(() => {
						registerPantry(new Pantry({}), arg);
					}, 'must be an instance of HandlebarsEnvironment, not ' +
						JSON.stringify(arg));
				}
			);

			t.doesNotThrow(() => {
				registerPantry(new Pantry({
					name: 'foo',
					path: 'bar'
				}), Handlebars.create())
					.then(() => t.end())
					.catch(e => {
						console.error(e);
						t.end();
					});
			}, 'accepts a HandlebarsEnvironment');
		});
	});

	t.test('returns a Promise', (t) => {
		var promise = registerPantry(new Pantry({}), Handlebars.create());

		t.type(promise, 'object');
		t.type(promise.then, 'function');

		t.end();
	});

	t.test('accepts a nodeback', (t) => {
		registerPantry(new Pantry({}), Handlebars.create(), () => {
			t.end();
		});
	});

	t.test('registers ingredients', (t) => {
		t.autoend();

		t.afterEach(() => {
			mockfs.restore();
		});

		t.test('in the pantry when registerOptions are specified', (t) => {
			mockfs({
				'pantry': {
					'@foo': {
						'bar': {
							'hello': {
								'ingredient.md': '',
								'index.hbs': 'hello, it\'s {{> @foo/bar/name}}'
							},
							'name': {
								'ingredient.md': '',
								'index.hbs': 'me'
							}
						}
					}
				}
			});

			var registerOptions = {
				pantrySearchPaths: [path.join(process.cwd(), 'pantry')]
			};

			return resolvePantry('@foo/bar', registerOptions)
				.then(pantry => {
					var hbCtx = Handlebars.create();
					return registerPantry(pantry, hbCtx, {
						registerOptions: {
							dependencyOptions: registerOptions
						}
					})
						.then(objs => {
							t.strictSame(objs.length, 2);
							t.type(hbCtx.partials['@foo/bar/hello'], 'function');
							t.type(hbCtx.partials['@foo/bar/name'], 'function');
							t.strictSame(
								hbCtx.partials['@foo/bar/hello'](),
								'hello, it\'s me'
							);
							t.end();
						});
				});
		});

		t.test('in the pantry when registerOptions are not specified', (t) => {
			mockfs({
				'pantry': {
					'@foo': {
						'bar': {
							'hello': {
								'ingredient.md': '',
								'index.hbs': 'hello, it\'s {{> @foo/bar/name}}'
							},
							'name': {
								'ingredient.md': '',
								'index.hbs': 'me'
							}
						}
					}
				}
			});

			var registerOptions = {
				pantrySearchPaths: [path.join(process.cwd(), 'pantry')]
			};

			return resolvePantry('@foo/bar', registerOptions)
				.then(pantry => {
					var hbCtx = Handlebars.create();
					return registerPantry(pantry, hbCtx)
						.then(objs => {
							t.strictSame(objs.length, 2);
							t.type(hbCtx.partials['@foo/bar/hello'], 'function');
							t.type(hbCtx.partials['@foo/bar/name'], 'function');
							t.strictSame(
								hbCtx.partials['@foo/bar/hello'](),
								'hello, it\'s me'
							);
							t.end();
						});
				});
		});

		t.test('but only registers each ingredient once', (t) => {
			mockfs({
				'myPantry': {
					'foo': {
						'hello': {
							'ingredient.md': '',
							'index.hbs': 'hello, it\'s {{> foo/name}}'
						},
						'name': {
							'ingredient.md': '',
							'index.hbs': 'me'
						}
					}
				},
				'myOtherPantry': {
					'foo': {
						'goodbye': {
							'ingredient.md': '',
							'index.hbs': 'goodbye, it\'s {{> foo/name}}'
						},
						'name': {
							'ingredient.md': '',
							'index.hbs': 'you'
						}
					}
				}
			});

			var hbCtx = Handlebars.create();
			var pantryAPaths = [path.join(process.cwd(), 'myPantry')];
			var pantryBPaths = [path.join(process.cwd(), 'myOtherPantry')];

			var registerOptions = {
				pantrySearchPaths: pantryAPaths
			};

			return resolvePantry('foo', registerOptions)
				.then(pantry => {
					return registerPantry(pantry, hbCtx, {
						registerOptions: {
							dependencyOptions: registerOptions
						}
					});
				})
				.then(() => {
					t.type(hbCtx.partials['foo/hello'], 'function');
					t.type(hbCtx.partials['foo/name'], 'function');
					t.strictSame(hbCtx.partials['foo/hello'](), 'hello, it\'s me');
				})
				.then(() => {
					registerOptions = {
						pantrySearchPaths: pantryBPaths
					};
					return resolvePantry('foo', registerOptions);
				})
				.then(pantry => {
					return registerPantry(pantry, hbCtx, {
						registerOptions: {
							dependencyOptions: registerOptions
						}
					});
				})
				.then(() => {
					t.type(hbCtx.partials['foo/goodbye'], 'function');
					t.type(hbCtx.partials['foo/name'], 'function');
					t.strictSame(hbCtx.partials['foo/goodbye'](), 'goodbye, it\'s me');
					t.end();
				});
		});
	});
});
