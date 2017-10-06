# @retailmenot/roux-handlebars-tools

This module provides tools for working with Roux ingredients that provide
a Handlebars entry point.

[![Build Status](https://travis-ci.org/RetailMeNotSandbox/roux-handlebars-tools.svg?branch=master)](https://travis-ci.org/RetailMeNotSandbox/roux-handlebars-tools)
[![Coverage Status](https://coveralls.io/repos/github/RetailMeNotSandbox/roux-handlebars-tools/badge.svg?branch=master)](https://coveralls.io/github/RetailMeNotSandbox/roux-handlebars-tools?branch=master)

## Installation

```sh
npm install @retailmenot/roux-handlebars-tools
```

## API

### `resolvePartialName`

Get a path to the file referenced by the partialName

- `partialName` - the name of the partial to locate
- `config` - optional configuration object
  - `config.extensions` - optional array of extensions to try when looking for
      partials; defaults to `['hbs', 'handlebars']`
  - `config.pantries` - an optional cache of `Pantry` instances
  - `config.pantrySearchPaths` - optional array of paths to search for pantries
      in if not found in the cache; defaults to `['$CWD/node_modules']`
  - `config.partials - an optional map of partial names to Handlebars source
      code; the partials will be processed if transitively depended on, but will
      not appear in the result
  - `config.partialSearchPaths` - optional array of paths to search for partials
      in the filesystem; defaults to `['$CWD']`

### `getPartialDependencies`

This method returns a promise of a map from the names of all partials a template
transitively depends on to their absolute path in the filesystem.

It accepts an optional map of partials as `config.partials`. These will be
explored if transitively depended on, but members of `config.partials` will not
be included in the result.

- `template` - the source code of a Handlebars template
- `config` - optional configuration object
  - `config.extensions` - optional array of extensions to try when looking for
      partials; defaults to `['hbs', 'handlebars']`
  - `config.pantries` - an optional cache of `Pantry` instances
  - `config.pantrySearchPaths` - optional array of paths to search for pantries
      in if not found in the cache; defaults to `['$CWD/node_modules']`
  - `config.partials - an optional map of partial names to Handlebars source
      code; the partials will be processed if transitively depended on, but will
      not appear in the result
  - `config.partialSearchPaths` - optional array of paths to search for partials
      in the filesystem; defaults to `['$CWD']`

#### Name resolution

This method will first attempt to resolve a prefix of the partial name as a Roux
ingredient. If able to do so, the partial name is assumed to refer to a template
in that ingredient. It will then attempt to get its absolute path, failing if
the file doesn't exist.

If unable to resolve a prefix as a Roux ingredient, the method attempts to find
the partial name relative to the paths in `config.partialSearchPaths`.
