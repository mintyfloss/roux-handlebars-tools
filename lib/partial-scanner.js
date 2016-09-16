'use strict';

var Handlebars = require('handlebars');

/**
 * Handlebars AST Visitor that captures unique partial names
 */
function PartialScanner() {
	this.partials = new Set();
	this.inlinePartials = new Set();
}
PartialScanner.prototype = new Handlebars.Visitor();
PartialScanner.prototype.constructor = PartialScanner;

/**
 * Fires on partial statements:
 * {{> foo }}
 *
 * Collects and registers partial name.
 *
 * @param {Object} partial - a Handlebars `PartialStatement`
 */
PartialScanner.prototype.PartialStatement = function (partial) {
	this.handlePartialStatement(partial);

	Handlebars.Visitor.prototype.PartialStatement.apply(this, arguments);
};

/**
 * Fires on partial block statements:
 * {{#> foo }}
 *
 * Collects and registers partial name.
 *
 * @param {Object} partial - a Handlebars `PartialBlockStatement`
 */
PartialScanner.prototype.PartialBlockStatement = function (partialBlock) {
	this.handlePartialStatement(partialBlock);

	Handlebars.Visitor.prototype.PartialBlockStatement.apply(this, arguments);
};

/**
 * Handle a partial or partial block statement, adding it to the list of partial
 * dependencies if it meets the requisite conditions.
 *
 * The statement's type will be checked against a whitelist to prevent dynamic
 * partials or other weirdo corner cases from leaking in or throwing errors.
 *
 * The partial name will also be ignored if it is present in the list of known
 * inline partials.
 *
 * @param statement - a partial or partial block statement
 */
PartialScanner.prototype.handlePartialStatement = function (statement) {
	// make sure the statement name expression's type is on the whitelist
	if (
		statement.name.type === 'StringLiteral' ||
		statement.name.type === 'PathExpression'
	) {
		const partialName = statement.name.original;

		// unless this is an inline partial we know about, add it to the list of
		// partials
		if (!this.inlinePartials.has(partialName)) {
			this.partials.add(partialName);
		}
	}
};

/**
 * Fires on decorator block statements. We only care about inline partial
 * decorations:
 *
 * {{#*inline "foo"}}
 *
 * We keep track of inline partials in order to prevent references to them from
 * being registered as dependencies.
 */
PartialScanner.prototype.DecoratorBlock = function (decoratorBlock) {
	// if this is an inline partial declaration, retain the partial name
	if (decoratorBlock.path.original === 'inline') {
		this.inlinePartials.add(decoratorBlock.params[0].original);
	}

	Handlebars.Visitor.prototype.DecoratorBlock.apply(this, arguments);
};

module.exports = PartialScanner;
