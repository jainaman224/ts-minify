/// <reference path='../../typings/mocha/mocha.d.ts'/>
/// <reference path='../../typings/chai/chai.d.ts'/>
/// <reference path='../../typings/node/node.d.ts'/>

import * as assert from 'assert';
import * as ts from 'typescript';
import * as chai from 'chai';
import * as fs from 'fs';
import {Minifier, options} from '../../src/main';

function expectTranslate(code: string) {
  var result = translateSource(code);
  return chai.expect(result);
}

var defaultLibName = ts.getDefaultLibFilePath(options);
var libSource = fs.readFileSync(ts.getDefaultLibFilePath(options), 'utf-8');
var libSourceFile: ts.SourceFile;

function parseFile(fileName: string, fileContent: string): ts.Program {
  var compilerHost: ts.CompilerHost = {

    getSourceFile: function(sourceName, languageVersion) {
      if (sourceName === defaultLibName) {
        if (!libSourceFile) {
          libSourceFile = ts.createSourceFile(sourceName, libSource, options.target, true);
        }
        return libSourceFile;
      }
      return ts.createSourceFile(sourceName, fileContent, options.target, true);
    },
    writeFile: function(name, text, writeByteOrderMark) { var result = text; },
    getDefaultLibFileName: () => defaultLibName,
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n'
  };

  var sourceFile = ts.createSourceFile(fileName, fileContent, options.target, true);
  var program = ts.createProgram([fileName], options, compilerHost);

  return program;
}

function translateSource(content: string): string {
  var minifier = new Minifier();
  var program = parseFile('test.ts', content);
  var typeChecker = program.getTypeChecker();
  var sourceFiles = program.getSourceFiles();
  var namesToContents = {};

  minifier.setTypeChecker(typeChecker);

  sourceFiles.forEach((sf) => {
    // if (not a .d.ts file) and (is a .js or .ts file)
    if (!sf.fileName.match(/\.d\.ts$/) && !!sf.fileName.match(/\.[jt]s$/)) {
      namesToContents[sf.fileName] = minifier.visit(sf);
    }
  });
  return namesToContents['test.ts'];
}

describe('Equality statement', () => {it('shows that 1 equals 1', () => { assert.equal(1, 1); })});

describe('Recognizes invalid TypeScript inputs', () => {
  it('expects a "Malformed TypeScript" error when fed invalid TypeScript', () => {
    var minifier = new Minifier();
    var program = parseFile('test.ts', 'function x console.log("hello"); }');
    chai.expect(() => minifier.checkForErrors(program)).to.throw(/Malformed TypeScript/);
  });
  it('does not throw an error when fed valid TypeScript', () => {
    var minifer = new Minifier;
    var program = parseFile('test.ts', '(function blah() {})');
    chai.expect(() => minifer.checkForErrors(program)).to.not.throw();
  })
});

describe('Visitor pattern', () => {
  it('renames identifiers of property declarations and property access expressions', () => {
    expectTranslate('class Foo { bar:string; constructor() {} baz() { this.bar = "hello"; } }')
        .to.equal('class Foo { $:string; constructor() {} baz() { this.$ = "hello"; } }');
    expectTranslate('var foo = { bar: { baz: 12; } }; foo.bar.baz;')
        .to.equal('var foo = { $:{ _:12; } }; foo.$._;');
    expectTranslate('class Foo {bar: string;} class Baz {bar: string;}')
        .to.equal('class Foo {$:string;} class Baz {$:string;}');
  });
});

describe('Selective renaming', () => {
  it('does not rename property names from the standard library', () => {
    expectTranslate('Math.random();').to.equal('Math.random();');
    expectTranslate('document.getElementById("foo");').to.equal('document.getElementById("foo");');
    expectTranslate('[1, 4, 9].map(Math.sqrt);').to.equal('[1, 4, 9].map(Math.sqrt);');
    expectTranslate('"hello".substring(0, 2);').to.equal('"hello".substring(0, 2);');
  });
});

describe('Next property name generation', () => {
  it('correctly generates a new shortname/alias', () => {
    var minifier = new Minifier();
    assert.equal(minifier.generateNextPropertyName('a'), 'b');
    assert.equal(minifier.generateNextPropertyName('ab'), 'ac');
    assert.equal(minifier.generateNextPropertyName(''), '$');
    assert.equal(minifier.generateNextPropertyName('$'), '_');
    assert.equal(minifier.generateNextPropertyName('_'), 'a');
    assert.equal(minifier.generateNextPropertyName('1'), 'a');
    assert.equal(minifier.generateNextPropertyName('$a'), '$b');
    assert.equal(minifier.generateNextPropertyName('$_'), '$0');
    assert.equal(minifier.generateNextPropertyName('z'), 'A');
    assert.equal(minifier.generateNextPropertyName('A'), 'B');
    assert.equal(minifier.generateNextPropertyName('9'), 'a');
    assert.equal(minifier.generateNextPropertyName('Z'), '$$');
    assert.equal(minifier.generateNextPropertyName('az'), 'aA');
    assert.equal(minifier.generateNextPropertyName('0a'), 'a$');
    assert.equal(minifier.generateNextPropertyName('0a00'), 'a$$$');
    assert.equal(minifier.generateNextPropertyName('a$'), 'a_');
  });
  it('correctly skips over reserved keywords', () => {
    var minifier = new Minifier();
    // skips generating 'in', which is a reserved word
    assert.equal(minifier.generateNextPropertyName('im'), 'io');
  })
});
