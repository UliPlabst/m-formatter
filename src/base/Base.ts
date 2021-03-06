import { Ast } from "../pq-ast";
import { Optional } from '../interfaces';
import { IFormatterConfig } from '../config/definitions';
import { CommentKind, TComment } from '../pq-ast';
import { ExtendedComment, extendComment } from '../CommentExtension';
import { defaultFormatterConfig } from '../config/default';

export type IEnumerable<T> = Generator<T, void, unknown>;

export type Cursor = 
{
  line: number;
  unit: number;
};

export type Range = 
{
  start: Cursor,
  end: Cursor,
};

export enum FormatResult 
{
  ExceedsLine = -2,
  Break = -1, 
  Ok,
}

export enum FormatNodeKind 
{
  AlwaysInline,
  AlwaysBreaking,
  BreakOnLineEnd,
  BreakOnAnyChildBroken, 
}

export interface IFormatState extends Cursor
{
  indent: number;
  stopOnLineBreak?: boolean;
  stopOnLineEnd?: boolean;
  forceLineBreak?: boolean;
  forceInline?: boolean;
  suppressInitialLineBreak?: boolean; //When first node in tree is a always line breaking node
  config: IFormatterConfig
}

export type OptionalFormatState = Optional<IFormatState>;

export interface IPublicNodeExtension
{
  respectsWhitespace?: boolean;
  takesLeadingComments?: boolean;
  getContentString?(): string;
  _ext: string;
}

export type FormatGenerator = Generator<FormatResult, FormatResult | void>

export interface INodeExtensionBase
{
  __extendedNode: boolean;
  _id: number;
  _formatCnt: number;
  leadingComments: ExtendedComment[];
  trailingComments: ExtendedComment[];
  parent: ExtendedNode;
  prevNode: ExtendedNode;
  nextNode: ExtendedNode;
  isBroken: boolean;
  state: IFormatState;
  wsBefore: number;
  wsAfter: number;
  outerRange: Range;
  innerRange: Range;
  children: PublicExtendedNode[];
  config: IFormatterConfig;
  initialize: (parent: ExtendedNode) => void;
  hasContentString: () => boolean;
  subState: (state?: OptionalFormatState) => IFormatState;
  nextIndentUnit: () => number;
  currIndentUnit: () => number;
  indentUnit: (number) => number;
  anyChildBroken: () => boolean;
  // inlineLength(): number;
  setOuterRangeStart: (state?: Optional<Cursor> | ExtendedNode) => void;
  setOuterRangeEnd: (state: Optional<Cursor> | ExtendedNode) => void;  
  setInnerRangeStart: (cursor:  Optional<Cursor> | ExtendedNode) => void;
  setInnerRangeEnd: (cursor:  Optional<Cursor> | ExtendedNode)  => void;
  exceedsLineLength: (line: number) => boolean;
  updateTokenRange: () => void;
  lastChild: () => PublicExtendedNode;
  initFormat: (state: IFormatState, wsBefore: number, wsAfter: number, opts: any) => void;
  finishFormat: () => void;
  formatLeadingComments: () => [FormatResult, IFormatState];
  formatTrailingComments: () => [FormatResult, IFormatState];
  getPreviousTextNode(): ExtendedNode;
  getNextTextNode(): ExtendedNode;
}

export interface IBaseNode<T = any> extends INodeExtensionBase
{
  formatKind: FormatNodeKind;
  format: (state: IFormatState, wsBefore?: number, wsAfter?: number, opts?: T) => FormatResult;
}

export interface IPrivateNodeExtension<T = any> extends IBaseNode<T>, IPublicNodeExtension
{
  opts?: T;
  _children?(): IEnumerable<PublicExtendedNode>;
  // _formatCustom?: () => FormatResult;
  _formatInline: () =>  FormatGenerator;
  _formatBroken: () => FormatResult
  // _inlineLength(): number;
}

var NodeCounter = 0;


export function *retGen<T1, T2, T3>(g: Generator<T1, T2, T3>): Generator<T1>
{
  let r: IteratorResult<T1>;
  do
  {
    r = g.next();
    if(r.value !== undefined)
      yield r.value
  }while(r.done == false);
}

function isGenerator<T1,T2,T3>(g): g is FormatGenerator
{
  return g && typeof g == "object" && typeof g.next === "function";
}

function *flatten(g: FormatGenerator): Generator<FormatResult>
{
  let r;
  do
  {
    r = g.next();
    if(isGenerator(r.value))
      yield *flatten(r.value);
    else if(r.value != undefined)
      yield r.value;
  }while(r.done == false)
}

export function genRes<T1,T2,T3>(g: FormatGenerator): FormatResult
{
  return Array.from(g).last();
}

type PublicExtendedNode<T extends Ast.INode = Ast.INode, TOpts = any> = T & IPublicNodeExtension & IBaseNode<TOpts>;
export type PrivateExtendedNode<T extends Ast.INode = Ast.INode, TOpts = any> = PublicExtendedNode<T> & IPrivateNodeExtension<TOpts>;

type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType[number];

type MapArrayExtendedNode<T> = {
  [prop in keyof T]: T[prop] extends (Ast.INode[] | readonly Ast.INode[]) ? Array<PublicExtendedNode<ArrayElement<T[prop]>>> : T[prop];
};
type MapExtendedNode<T> = {
  [prop in keyof T]: T[prop] extends Ast.INode ? PublicExtendedNode<T[prop]> : T[prop];
};

type MappedNode<T> = MapArrayExtendedNode<MapExtendedNode<T>>;

export type PrivateNode<T extends Ast.INode = Ast.INode, TOpts = any> = MappedNode<T> & PrivateExtendedNode<T, TOpts>;
export type ExtendedNode<T extends Ast.INode = Ast.INode, TOpts = any> = MappedNode<T> & PublicExtendedNode<T, TOpts>;

function getLeadingComments(node: ExtendedNode, comments: TComment[]): ExtendedComment[]
{
  let res = [];
  for(let c of comments.slice())
  {
    if(node.tokenRange.positionStart.codeUnit >= c.positionEnd.codeUnit)
    {
      res.push(comments.splice(comments.indexOf(c), 1)[0]);
    }
  }
  return res;
}

export const NodeExtensionBase: INodeExtensionBase =
{
  __extendedNode: true,
  _id: null,
  _formatCnt: 0,
  parent: null,
  prevNode: null,
  nextNode: null,
  state: null,
  isBroken: false,
  wsBefore: null,
  wsAfter: null,
  outerRange: null,
  innerRange: null,
  children: [],
  config: defaultFormatterConfig,
  leadingComments: null,
  trailingComments: null,
  initialize: function(this: PrivateExtendedNode, parent: ExtendedNode) {
    this._id              = NodeCounter;
    NodeCounter++;
    this.parent           = parent;
    this.leadingComments  = [];
    this.trailingComments = [];
    
    this.outerRange = {
      start: {
        line: null,
        unit: null,
      },
      end: {
        line: null,
        unit: null
      }
    };
    this.innerRange = {
      start: {
        line: null,
        unit: null,
      },
      end: {
        line: null,
        unit: null
      }
    };
    
    if(typeof this._children === "function")
      this.children = Array.from(this._children()).filter(c => c != null);
  },
  initFormat: function(this: IPrivateNodeExtension & ExtendedNode, state: IFormatState, wsBefore: number, wsAfter: number, opts: any) {
    this.isBroken = false;
    this._formatCnt++;
    if(opts != null)
    {
      this.opts = {
        ...this.opts,
        ...opts
      }
    }
    this.state    = state;
    this.wsBefore = wsBefore ?? 0;
    this.wsAfter  = wsAfter ?? 0;
    this.config   = this.state.config;
    if(this.prevNode && this.prevNode.trailingComments.any(c => c.kind == CommentKind.Line && this.prevNode.outerRange.end.line == this.state.line))
    {
      this.state = this.parent.subState({
        unit: this.indentUnit(this.state.indent),
        indent: this.state.indent,
        line: this.state.line + 1
      })
    }
  },
  finishFormat: function(this: IPrivateNodeExtension){},
  formatLeadingComments: function(this: IPrivateNodeExtension): [FormatResult, IFormatState] {
    if(this.config.includeComments == false)
      return [FormatResult.Ok, this.state];
      
    let state = this.state;
    let i = 0;
    for(let c of this.leadingComments)
    {
      let result = c.format(state, this.config, i != 0);
      state = {
        ...this.state,
        ...c.range.end
      };
      if(result == FormatResult.Break && this.state.stopOnLineBreak == true)
        return [FormatResult.Break, state];
      i++;
    }
    return [FormatResult.Ok, state];
  },
  formatTrailingComments: function(this: IPrivateNodeExtension): [FormatResult, IFormatState] {
    if(this.config.includeComments == false)
      return [FormatResult.Ok, this.state];
      
    //trailing comments can never break line!
    let i = 0;
    let state = this.subState(this.innerRange.end);
    for(let c of this.trailingComments)
    {
      let result = c.format(state, this.config, i != 0);
      state = this.subState(c.range.end);
      i++;
    }
    return [FormatResult.Ok, state];
  },
  hasContentString: function(this: IPrivateNodeExtension) {
    return typeof this.getContentString === "function";
  },
  lastChild: function(this: IPrivateNodeExtension): PublicExtendedNode {
    return this.children?.last();
  },
  subState: function(this: PrivateExtendedNode, state?: OptionalFormatState): IFormatState {
    state = state ?? {};
    return {
      ...this.state,
      forceLineBreak: null,
      forceInline: null,
      stopOnLineBreak: state.stopOnLineBreak ?? this.state.stopOnLineBreak ?? false,
      stopOnLineEnd: state.stopOnLineEnd ?? this.state.stopOnLineEnd ?? false,
      suppressInitialLineBreak: null,
      ...state,
    };
  },
  nextIndentUnit: function(this: PrivateExtendedNode) {
    return (this.state.indent + 1) * this.config.indentationLength;
  },
  currIndentUnit: function(this: PrivateExtendedNode) {
    return this.state.indent * this.config.indentationLength;
  },
  indentUnit: function(this: PrivateExtendedNode, ind: number) {
    return ind * this.config.indentationLength;
  },
  anyChildBroken: function(this: PrivateExtendedNode): boolean
  {
    for(let c of this.children)
    {
      if(c.isBroken == true)
        return true;
      if(c.anyChildBroken())
        return true;
    }
    return false;
  },
  setOuterRangeStart: function(this: PrivateExtendedNode, cursor: Optional<Cursor> | ExtendedNode = null) {
    if(isExtendedNode(cursor))
      cursor = cursor.outerRange.start;
    this.outerRange.start.line = cursor?.line ?? this.state.line;
    this.outerRange.start.unit = cursor?.unit ?? this.state.unit;
  },
  setOuterRangeEnd: function(this: PrivateExtendedNode, cursor: Optional<Cursor> | ExtendedNode) {
    if(isExtendedNode(cursor))
      cursor = cursor.outerRange.end;
    this.outerRange.end.line = (cursor?.line ?? this.state.line);
    this.outerRange.end.unit = (cursor?.unit ?? this.state.unit);;
  },
  setInnerRangeStart(this: PrivateExtendedNode, cursor: Optional<Cursor>|ExtendedNode) {
    if(isExtendedNode(cursor))
      cursor = cursor.outerRange.end;
    this.innerRange.start.line = cursor?.line ?? this.state.line;
    this.innerRange.start.unit = cursor?.unit ?? this.state.unit;
  },
  setInnerRangeEnd(this: PrivateExtendedNode, cursor: Optional<Cursor>|ExtendedNode) {
    let off = this.respectsWhitespace == true ? this.wsAfter : 0;
    if(isExtendedNode(cursor))
      cursor = cursor.outerRange.end;
    this.innerRange.end.line = (cursor?.line ?? this.state.line);
    this.innerRange.end.unit = (cursor?.unit ?? this.state.unit) + off;
  },
  exceedsLineLength: function(this: PrivateExtendedNode, line: number): boolean {
    if(this.outerRange.end.line == line)
      return this.outerRange.end.unit > this.config.lineWidth;
      
    if(this.outerRange.end.line > line)
      return false;
      
    for(let c of this.children)
    {
      if(c.tokenRange.positionStart.lineNumber > line)
        break;
      
      if(c.exceedsLineLength(line))
        return true;
    }
    return false;
  },
  updateTokenRange: function(this: PrivateExtendedNode) {
    let {start, end} = this.innerRange;
    Object.assign(this.tokenRange, {
      positionStart: {
        lineNumber: start.line,
        lineCodeUnit: this.respectsWhitespace == true ? (start.unit + this.wsBefore) : start.unit
      }
    });
    Object.assign(this.tokenRange,{
      positionEnd: {
        lineNumber: end.line,
        lineCodeUnit: this.respectsWhitespace == true ? (end.unit - this.wsAfter) : end.unit,
      }
    });
    this.leadingComments.forEach(c => c.updateTokenRange());
    this.children.forEach(c => c.updateTokenRange());
    this.trailingComments.forEach(c => c.updateTokenRange());
  },
  getPreviousTextNode: function(this: PrivateExtendedNode) {
    let curr = this.prevNode;
    while(curr != null && typeof curr.getContentString != "function")
    {
      curr = curr.prevNode;
    }
    return curr;
  },
  getNextTextNode: function(this: PrivateExtendedNode){
    let curr = this.nextNode;
    while(curr != null && typeof curr.getContentString != "function")
    {
      curr = curr.nextNode;
    }
    return curr;
  },
  // format: function*(this: PrivateExtendedNode, state: IFormatState, wsBefore: number = null, wsAfter: number = null): FormatResult {
  //   this._formatCnt++;
  //   this.state    = state;
  //   this.wsBefore = wsBefore ?? 0;
  //   this.wsAfter  = wsAfter ?? 0;
    
  //   this.setRangeStart();
    
  //   if(this.formatKind == FormatNodeKind.AlwaysBreaking)
  //     this.state.forceLineBreak = true;
  //   else if(this.formatKind == FormatNodeKind.AlwaysInline)
  //     this.state.forceInline = true;
      
  //   if(this.state.forceInline == true && this.state.forceLineBreak == true)
  //     throw new Error("forceInline and forceLineBreak are both true!");
    
  //   // if(this.formatKind == FormatNodeKind.AlwaysInline || this.state.forceInline == true)
  //   // {
  //   //   return this._formatInline();
  //   // }
      
  //   // if(this.formatKind == FormatNodeKind.AlwaysBreaking || this.state.forceLineBreak == true)
  //   // {
  //   //   if(this.state.stopOnLineBreak == true)
  //   //     return FormatResult.Break;
        
  //   //   this.isBroken = true;
  //   //   return this._formatBroken();
  //   // }
    
  //   let res: FormatResult;
  //   if(this.state.forceLineBreak != true)
  //   {
  //     this.isBroken = false;
  //     for(res of flatten(this._formatInline()))
  //     {
  //       if(res == FormatResult.Break && this.state.stopOnLineBreak == true)
  //         return res;
  //       if(res == FormatResult.ExceedsLine && (this.formatKind == FormatNodeKind.BreakOnLine || this.formatKind == FormatNodeKind.BreakOnAnyChildBroken))
  //         break;
  //       if(res == FormatResult.Break && this.formatKind == FormatNodeKind.BreakOnAnyChildBroken)
  //         break;
  //     }
  //   }
    
  //   if(this.state.forceInline != true)
  //   {
  //     this.isBroken = true;
  //     if(this.state.stopOnLineBreak == true)
  //       return FormatResult.Break;
        
  //     res = genRes(this._formatBroken());
  //   }
    
  //   if(this.children.length != 0)
  //     this.setRangeEnd(this.children.last());
    
  //   this.updateTokenRange();
  //   return FormatResult.Ok;
    
  //   // return boolean or state? does make sense?
  //   //with inlineLength every node reports the length of the elements in the current line -> a child node can decide to break
  // },
};

export function traverse(node: ExtendedNode, action: (node: ExtendedNode) => void)
{
  action(node);
  for(let c of node.children)
  {
    traverse(c, action);
  }
}

export function isExtendedNode(node: any): node is ExtendedNode
{
  return node != null && typeof node === "object" && node.kind != null && node.formatKind != null;
}
