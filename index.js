'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var Handlebars = require('handlebars');
var log = require('debug')('retailmenot:roux-handlebars-tools');
var path = require('path');
var rouxIngredientPantry = require('@retailmenot/roux');
var parseIngredientPath = rouxIngredientPantry.parseIngredientPath;
var util = require('util');

var PartialScanner = require('./lib/partial-scanner');

var fs = Promise.promisifyAll(require('fs'));

/*
 * Given a path and an array of extensions return of a promise of one
 * combination of the path and an extension that actually exists on disk. If
 * more than one exists, there is no guarantee which will be returned.
 */
function findPathWithExtensions(filePath, extensions) {
	return Promise.any(
		_.map(extensions, function (extension) {
			var extendedPath = filePath + '.' + extension;
			return fs.statAsync(extendedPath).return(extendedPath);
		})
	);
}

function allAreENOENT(error) {
	if (error instanceof Promise.AggregateError) {
		return _.every(error, allAreENOENT);
	}

	return error.code === 'ENOENT';
}

/*
 * Get a promise of the transitive dependencies of a template
 *
 * This helper function will recursively explore the partial dependencies of a
 * template until all have been found. The result is a map from unique partial
 * names to an absolute path to their source code in the file system.
 *
 * Members of `config.partials` will be explored if transitively depended on by
 * `template`, but their mapped value in the result will be `null` instead of an
 * absolute path.
 *
 * @param {Object} partials - map of partials seen thus far and their absolute
 *	 path on disk (or `null` for members of `config.partials`)
 * @param {string} template - the source code of a Handlebars template
 * @param {Object} config - configuration object
 * @param {Object} config.pantries - a cache of `Pantry` instances
 * @param {string[]} config.pantrySearchPaths - the paths to search for
 *	 pantries in if not found in the cache
 * @param {Object} config.partials - a map of partial names to Handlebars
 *	 source code; the partials will be processed if transitively depended on,
 *	 but will not appear in the result
 * @param {string[]} config.partialSearchPaths - the paths to search for
 *	 partials in the filesystem
 *
 * @return {Promise} - promise of a map from partial names to an absolute path
 *	 to their source code or `null`
 */
function getPartialDependencies(template, config, partials) {
	partials = partials || {};

	return Promise.try(function () {
		var ast = Handlebars.parse(template);
		var scanner = new PartialScanner();

		// find the partials in the template
		scanner.accept(ast);

		// get a list of partials we have not seen before
		var toVisit = [];
		scanner.partials.forEach(function (partial) {
			if (!(partial in partials)) {
				toVisit.push(partial);
			}
		});

		// for each partial we have not seen
		return Promise.map(toVisit, function (partial) {
			if (partial in config.partials) {
				// this partial is in config.partials, so save it to partials with a
				// null path so that we (1) know we've visited it and (2) can filter
				// it out of the final result
				partials[partial] = null;

				// return the template source from config.partials
				return Promise.resolve(config.partials[partial]);
			}

			return resolvePartialName(partial, config).then(function (partialPath) {
				if (!partialPath) {
					throw new Error('Could not resolve ' + partial);
				}

				// add this partial to those we've seen before
				partials[partial] = partialPath;

				// read its source code from the file system
				return fs.readFileAsync(partialPath, {encoding: 'utf8'});
			});
		})
		.map(function (template) {
			// recursively explore its dependencies
			return getPartialDependencies(template, config, partials);
		})
		.reduce(function (partials, templatePartials) {
			// merge discovered dependencies back into our results
			_.assign(partials, templatePartials);

			return partials;
		}, partials);
	});
}

/**
 * Get a promise of the absolute path of a Handlebars partial
 *
 * This function will first try to resolve the partial name to a template file
 * descending from one of the directories named in `config.partialSearchPaths`.
 * If unable to do so, it attempts to resolve the partial name to a template
 * file in a Roux ingredient.
 *
 * @param {string} partialName - the name of a Handlebars partial
 * @param {Object} config - configuration object
 * @param {Object} config.pantries - a cache of `Pantry` instances
 * @param {string[]} config.pantrySearchPaths - the paths to search for
 *	 pantries in if not found in the cache
 * @param {string[]} config.partialSearchPaths - the paths to search for
 *	 partials in the filesystem
 *
 * @return {Promise} - promise of a map from partial names to an absolute path
 *	 to their source code or `null`
 */
function resolvePartialName(partialName, config) {
	return Promise.try(function () {
		// first, try to resolve the partial to a standard template
		return Promise.any(
			_.map(config.partialSearchPaths, function (searchPath) {
				return findPathWithExtensions(
					path.resolve(searchPath, partialName),
					config.extensions
				);
			})
		)
		.catch(function (error) {
			if (!allAreENOENT(error)) {
				// At least one error was not ENOENT, so reject with the original error
				throw error;
			}

			// We could not resolve to a local partial, so look for an ingredient

			var parsedPartial = parseIngredientPath(partialName);
			if (!parsedPartial) {
				throw new Error('Could not locate a partial named ' + partialName);
			}

			return rouxIngredientPantry.resolve(
					parsedPartial.pantry,
					config
				)
				.then(function (pantry) {
					if (!pantry) {
						throw new Error(
							util.format(
								'Could not locate a partial named %s. No such pantry %s.',
								partialName,
								parsedPartial.pantry
							)
						);
					}

					// because we don't know where the ingredient path ends and the
					// partial path begins, we try progressively larger prefixes of the
					// ingredient/partial path until an ingredient is found
					var ingredientTokens = parsedPartial.ingredient.split('/');
					var ingredient;
					for (var i = 0; i < ingredientTokens.length; i++) {
						ingredient =
							pantry.ingredients[ingredientTokens.slice(0, i + 1).join('/')];
						if (ingredient) {
							return ingredient;
						}
					}

					// the parsed partial name did not resolve to an ingredient
					throw new Error(
						util.format(
							'Could not locate a partial named %s. No ingredient found in %s.',
							partialName,
							parsedPartial.ingredient
						)
					);
				})
				.then(function (ingredient) {
					// return appropriate file in the ingredient, or throw
					if (_.endsWith(partialName, ingredient.name)) {
						// the partial name ends with the ingredient. return the entry point
						return path.resolve(
							ingredient.path,
							ingredient.entryPoints.handlebars.filename
						);
					}

					// the partial names a file inside the ingredient, so remove the
					// ingredient path from the partial name and attempt to resolve the
					// remainder relative to the ingredient root
					return findPathWithExtensions(
						path.resolve(
							ingredient.path,

							// slice out the part of the partial name after the ingredient
							partialName.slice([
								ingredient.pantryName,
								ingredient.name
							].join('/').length + 1)
						),
						config.extensions
					);
				});
		});
	});
}

function normalizeConfig(config) {
	config = rouxIngredientPantry.normalizeConfig(config, {
		extensions: ['hbs', 'handlebars'],
		partials: {},
		partialSearchPaths: [process.cwd()]
	});

	if (!_.isArray(config.extensions)) {
		throw new TypeError('`config.extensions` must be an array');
	}

	if (!_.isObject(config.partials)) {
		throw new TypeError('`config.partials` must be an object');
	}

	if (!_.isArray(config.partialSearchPaths)) {
		throw new TypeError('`config.partialSearchPaths` must be an Array');
	}

	config.partials = _.clone(config.partials);

		// ignore the special `@partial-block` partial
	config.partials['@partial-block'] = '';
	return config;
}

module.exports = {

	/**
	 * Get a path to the file referenced by the partialName
	 *
	 * @param {string} partialName - the partialName to resolve
	 * @param {Object} [config] - configuration object
	 * @param {string} [config.extensions=['hbs', 'handlebars']] - extensions to
	 *   try when looking for partials
	 * @param {Object} [config.pantries] - a cache of `Pantry` instances
	 * @param {string[]} [config.pantrySearchPaths] - the paths to search for
	 *	 pantries in if not found in the cache
	 * @param {string[]} [config.partialSearchPaths] - the paths to search for
	 *	 partials in the filesystem
	 *
	 * @return {Promise} - promise of the path to the file referenced by the
	 *   partialName
	 */

	resolvePartialName: function (partialName, config) {
		if (!_.isString(partialName)) {
			throw new TypeError('`partialName` must be a string');
		}

		config = normalizeConfig(config);
		return resolvePartialName(partialName, config);
	},

	/**
	 * Get a map from the names of all partials a template transitively depends on
	 * to their absolute path
	 *
	 * It accepts an optional map of partials as `config.partials`. These will be
	 * explored if transitively depended on, but members of `config.partials` will
	 * not be included in the result.
	 *
	 * @param {string} template - the source code of a Handlebars template
	 * @param {Object} [config] - configuration object
	 * @param {string} [config.extensions=['hbs', 'handlebars']] - extensions to
	 *   try when looking for partials
	 * @param {Object} [config.pantries] - a cache of `Pantry` instances
	 * @param {string[]} [config.pantrySearchPaths] - the paths to search for
	 *	 pantries in if not found in the cache
	 * @param {Object} [config.partials] - a map of partial names to Handlebars
	 *	 source code; the partials will be processed if transitively depended on,
	 *	 but will not appear in the result
	 * @param {string[]} [config.partialSearchPaths] - the paths to search for
	 *	 partials in the filesystem
	 *
	 * @return {Promise} - promise of a map from partial names to an absolute path
	 *	 to their source code
	 */
	getPartialDependencies: function (template, config) {
		if (!_.isString(template)) {
			throw new TypeError('`template` must be a string');
		}

		config = normalizeConfig(config);

		return Promise.try(function () {
			return getPartialDependencies(template, config)
				.then(function (dependencies) {
					// filter any dependencies from config.partials and return the result
					return _.pick(dependencies, function (partialPath) {
						return partialPath !== null;
					});
				});
		});
	},

	/**
	 * Handlebars context where helpers, partials, and decorators are registered.
	 *
	 * @external HandlebarsEnvironment
	 * @see {@link https://github.com/wycats/handlebars.js/blob/master/lib/handlebars/base.js}
	 */

	/**
	 * An interface to a pantry of Roux ingredients.
	 *
	 * @external Pantry
	 * @see {@link https://github.com/RetailMeNotSandbox/roux/blob/master/lib/pantry.js}
	 */

	/**
	 * Register a Handlebars partial with `templateSource` as `name` on
	 * `handlebarsEnv`.
	 *
	 * @param {String} name - name of partial
	 * @param {String} templateSource - template source code
	 * @param {HandlebarsEnvironment} handlebarsEnv - handlebars environment to
	 * 	 register partials on
	 * @param {Object} [options]
	 * @param {Object} [options.dependencyOptions] - options hash to pass
	 *   directly to `getPartialDependencies`
	 * @param {Object} [options.registerTransitiveDependencies=true] - parse
	 * 	 template source and attempt to register all required transitive
	 * 	 dependencies
	 * @param {Function} [cb] - nodeback
	 *
	 * @throws Will throw if type mismatch for name, templateSource, or
	 * 	 handlebarsEnv
	 * @returns {Promise} promise of an object containing partial name and
	 *   render function
	 */
	registerPartial(name, templateSource, handlebarsEnv, options, cb) {
		if (!_.isString(name)) {
			throw new TypeError('name must be a string');
		}

		if (!_.isString(templateSource)) {
			throw new TypeError('templateSource must be a string');
		}

		if (!handlebarsEnv ||
			!(handlebarsEnv instanceof handlebarsEnv.HandlebarsEnvironment)) {
			throw new TypeError(
				'handlebarsEnv must be an instance of HandlebarsEnvironment'
			);
		}

		if (!cb && _.isFunction(options)) {
			cb = options;
			options = {};
		}

		options = _.defaultsDeep({}, options, {
			registerTransitiveDependencies: true,
			dependencyOptions: {}
		});

		var compiledTemplate = handlebarsEnv.partials[name];
		if (!compiledTemplate) {
			log('registering partial: %s', name);
			compiledTemplate = handlebarsEnv.compile(templateSource);
			handlebarsEnv.registerPartial(name, compiledTemplate);
		}

		if (!options.registerTransitiveDependencies) {
			log('do not register transitive dependencies');
			return Promise.resolve({name, template: compiledTemplate})
				.asCallback(cb);
		}

		return module.exports.getPartialDependencies(
			templateSource,
			options.dependencyOptions
		).then(dependencies => {
			return Promise.all(_.map(dependencies, (fileName, depName) => {
				if (!(depName in handlebarsEnv.partials)) {
					return fs.readFileAsync(fileName, {encoding: 'utf8'})
						.then(partialSource => {
							var compiledPartial = handlebarsEnv.compile(partialSource);
							handlebarsEnv.registerPartial(depName, compiledPartial);
						});
				}

				log('partial already registered, skipping: %s', depName);
				return null;
			}));
		}).then(() => {
			return {name, template: compiledTemplate};
		}).asCallback(cb);
	},

	/**
	 * Register a pantry of ingredient partials on `handlebarsEnv`.
	 *
	 * @param {Pantry} pantry - pantry instance to extract ingredient partials
	 *   from
	 * @param {HandlebarsEnvironment} handlebarsEnv - handlebars environment to
	 * 	 register ingredient partials on
	 * @param {Object} [options]
	 * @param {Object} [options.registerOptions=] - options hash to proxy to
	 * 	 `registerPartial` calls
	 * @param {Function} [cb] - nodeback
	 *
	 * @throws Will throw if type mismatch for pantry or handlebarsEnv
	 * @returns {Promise} promise of array of objects containing partial name and
	 *   render function
	 */
	registerPantry(pantry, handlebarsEnv, options, cb) {
		if (!pantry || pantry.constructor.name !== 'Pantry') {
			throw new TypeError('pantry must be an instance of Pantry');
		}

		if (!handlebarsEnv ||
			!(handlebarsEnv instanceof handlebarsEnv.HandlebarsEnvironment)) {
			throw new TypeError(
				'handlebarsEnv must be an instance of HandlebarsEnvironment'
			);
		}

		if (!cb && _.isFunction(options)) {
			cb = options;
			options = {};
		}

		var pantrySearchPaths = [path.resolve('node_modules')];

		// extract path that the pantry lives in.
		// eg: for a pantry named @foo/bar that is located on disk at
		// /some/path/@foo/bar, extract /some/path and add it to the
		// pantrySearchPaths array
		if (pantry.path && pantry.path.lastIndexOf(pantry.name) !== -1) {
			pantrySearchPaths.push(
				pantry.path.substring(0, pantry.path.lastIndexOf(pantry.name))
			);
		}

		options = _.defaultsDeep({}, options, {
			registerOptions: {
				dependencyOptions: {
					pantrySearchPaths
				}
			}
		});

		if (!pantry.ingredients) {
			return Promise.resolve([]).asCallback(cb);
		}

		var promises = _.keys(pantry.ingredients)
			.filter(ingredientName => {
				return !!pantry.ingredients[ingredientName].entryPoints.handlebars;
			})
			.map(ingredientName => {
				var ingredient = pantry.ingredients[ingredientName];
				var name = `${pantry.name}/${ingredient.name}`;
				var fileName = ingredient.entryPoints.handlebars.filename;
				var filePath = path.join(ingredient.path, fileName);
				return fs.readFileAsync(filePath, {encoding: 'utf8'})
					.then(partialSource => {
						return module.exports.registerPartial(
							name,
							partialSource,
							handlebarsEnv,
							options.registerOptions
						);
					});
			});
		return Promise.all(promises).asCallback(cb);
	}
};
