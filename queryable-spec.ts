
import RDF from '@rdfjs/types';
import { EventEmitter } from 'events'; // TODO: refer to underlying interface, not to the class

/******************************************************************************
                          COMMON INTERFACES AND TYPES
 *****************************************************************************/

/*
 * Helper union type 
 */
type TermName = 'subject' | 'predicate' | 'object' | 'graph';

/*
 * Custom typings for the RDF/JS Stream interface as the current
 * typings restrict the generic param Q to extensions of "BaseQuad",
 * meaning it cannot be used for Bindings.
 */
export interface Stream<Q> extends EventEmitter {
  read(): Q | null;
}

/**
 * QueryOperationCost represents the cost of a given query operation.
 */
 interface QueryOperationCost {
  /**
   * An estimation of how many iterations over items are executed.
   * This is used to determine the CPU cost.
   */
  iterations: number;
  /**
   * An estimation of how many items are stored in memory.
   * This is used to determine the memory cost.
   */
  persistedItems: number;
  /**
   * An estimation of how many items block the stream.
   * This is used to determine the time the stream is not progressing anymore.
   */
  blockingItems: number;
  /**
   * An estimation of the time to request items from sources.
   * This estimation can be based on the `cardinality`, `pageSize`, and `requestTime` metadata entries.
   * This is used to determine the I/O cost.
   */
  requestTime: number;
  /**
   * Custom properties
   */
  [key: string]: any;
}

/**
 * QueryOperationOrder represents an ordering of the results of a given
 * query operation. QueryOperationOrder objects can be returned by
 * implementations of both the Filterable (quad orderings) and Queryable
 * (bindings orderings) interfaces. Furthermore, QueryOperationObjects are
 * used to represent both available orderings (i.e. orderings that may be
 * requested by callers) and returned orderings (i.e. orderings followed
 * by the returned iterators).
 */
interface QueryOperationOrder<T extends TermName | RDF.Variable> {
  cost: QueryOperationCost;
  terms: { term: T, direction: 'asc' | 'desc' }[];
}


/******************************************************************************
                              FILTERABLE SOURCE
 *****************************************************************************/


/**
 * QueryResultMetadataOptions is an abstract interface that represents a generic 
 * expression over a stream of quads. 
 */
interface Expression {
  /**
   * Value that identifies the concrete interface of the expression, since the
   * Expression itself is not directly instantiated. Possible values include 
   * "operator" and "term".
   */
  expressionType: string;
};

/**
 * An OperatorExpression is represents an expression that applies a given
 * operator on given sub-expressions.
 * 
 * The WebIDL definition of the Filterable spec contains a list of supported 
 * operators: https://rdf.js.org/query-spec/#expression-operators 
 */
interface OperatorExpression extends Expression {
  
  /** 
   * Contains the constant "operator". 
   */
  expressionType: 'operator';

  /**
   * Value that identifies an operator. Possible values can be found in the 
   * list of operators.
   */
  operator: string;

  /**
   * Array of Expression's on to which the given operator applies. The length
   * of this array depends on the operator.
   */
  args: Expression[];
};

/**
 * A TermExpression is an expression that contains a Term.
 */
interface TermExpression {
  
  /**
   * The constant "term".
   */
  expressionType: 'term';

  /**
   * a Term.
   */
  term: RDF.Term;
}

/**
 * ExpressionFactory enables expressions to be created in an idiomatic manner.
 */
interface ExpressionFactory {
  
  /**
   * Creates a new OperatorExpression instance for the given operator and array of arguments.
   */
  operatorExpression(operator: string, args: Expression[]): OperatorExpression;

  /**
   * Creates a new TermExpression instance for the given term.
   */
  termExpression(term: RDF.Term): TermExpression;
};


/**
 * QueryResultMetadataCount is part of the QueryResultMetadata interface to
 * represent metadata about the number of quads in the result stream.
 */
interface FilterableResultMetadataCardinality {
  /**
   * indicates the type of counting that was done, and MUST either be 
   * "estimate" or "exact".
   */
  type: 'estimate' | 'exact';

  /**
   * Indicates an estimate of the number of quads in the stream if 
   * type = "estimate", or the exact number of quads in the stream if 
   * type = "exact".
   */
  value: number;
};
  
/**
 * A QueryResultMetadata is an object that contains metadata about a certain
 * query result, such as invoking FilterableSource.matchExpression.
 */
interface FilterableResultMetadata {
  
  /**
   * An optional field that contains metadata about the number of quads in the
   * result stream.
   */
  cardinality?: FilterableResultMetadataCount;

  /**
   * An optional field that contains the available options for quad sorting
   * based on the provided pattern, expression and options.
   */
  availableOrders?: QueryOperationOrder<TermName>[];
};

/**
 * A QueryResultMetadataOptions is an object that gives suggestions on what
 * type of metadata is desired, such as when invoking FilterResult.metadata.
 */
interface FilterableResultMetadataOptions {

  /**
   * optional field that MAY either contain "estimate" or "exact". If defined,
   * this type MUST correspond to the type in QueryResultMetadataCount.
   */
  cardinality?: 'estimate' | 'exact';
};



/**
 * A FilterResult is an object that represents the result of a filter 
 * expression of FilterableSource for a given quad pattern and expression. 
 * It MAY create results lazily after one of its methods is invoked.
 */
interface FilterableResult {

  /**
   * Returns a Stream containing all the quads that matched the given quad
   * pattern and expression.
   */
  execute(opts?: { order?: QueryOperationOrder<TermName> }): Promise<Stream<RDF.Quad>>;

  /**
   * Asynchronously returns a QueryResultMetadata, that contains the metadata
   * of the current result.
   */
  metadata(opts?: FilterableResultMetadataOptions): Promise<FilterableResultMetadata>;
  
  /**
   * Asynchronously returns a boolean indicating if the requested expression is
   * supported by the FilterableSource. If it returns true, quads() and 
   * metadata() MAY produce a valid result. If it returns false, quads() MUST
   * return a stream emitting an error, and metadata() MUST reject.
   */
  isSupported(): Promise<boolean>;
};

/* 
 * A FilterableSource is an object that produces a FilterableSourceResult that
 * can emit quads. The emitted quads can be directly contained in this 
 * FilterableSourceo bject, or they can be generated on the fly.
 * 
 * FilterableSource is not necessarily an extension of the RDF/JS Source 
 * interface, but implementers MAY decide to implement both at the same time.
 * 
 * matchExpression() Returns a FilterableSourceResult that contains a quad 
 * stream that processes all quads matching the quad pattern and the expression.
 * 
 * When a Term parameter is defined, and is a NamedNode, Literal or BlankNode, 
 * it must match each produced quad, according to the Quad.equals semantics. 
 * When a Term parameter is a Variable, or it is undefined, it acts as a 
 * wildcard, and can match with any Term.
 * 
 * NOTES:
 * - When matching with graph set to undefined or null it MUST match all the
 *   graphs (sometimes called the union graph). To match only the default graph
 *   set graph to a DefaultGraph.
 * - When an Expression parameter is defined, the complete quad stream is
 *   filtered according to this expression. When it is undefined, no filter is
 *   applied.
 * 
 * If parameters of type Variable with an equal variable name are in place,
 * then the corresponding quad components in the resulting quad stream MUST be
 * equal.
 * Expression's MAY contain Variable Term's. If their variable names are equal
 * to Variable's in the given quad pattern, then the Expression MUST be 
 * instantiated for each variable's binding in the resulting quad stream when
 * applying the Expression filter.
 */
interface FilterableSource {
  matchExpression(
    subject?: RDF.Term,
    predicate?: RDF.Term,
    obj?: RDF.Term,
    graph?: RDF.Term,
    expression?: Expression,
    opts?: { 
      limit?: number; 
      offset?: number; 
    },
  ): FilterableResult;
};


/******************************************************************************
                              QUERYABLE SOURCE
 *****************************************************************************/

/*
 * Map-like representation of Bindings as using plain objects could lead
 * to collisions between variable names and object properties. Support for
 * immutability is required (but implementations are free to be mutable) which
 * determines the return value of the set() and delete() methods to be an 
 * instance of Bindings (potentially a different one).
 */ 
interface Bindings extends Iterable<[RDF.Variable, RDF.Term]> {
  type: 'bindings';
  has: (key: RDF.Variable) => boolean;
  get: (key: RDF.Variable) => RDF.Term | undefined;
  keys: () => Iterator<RDF.Variable>;
  values: () => Iterator<RDF.Term>;
  entries: () => Iterator<[RDF.Variable, RDF.Term]>;
  forEach: (fn: (value: RDF.Term, key: RDF.Variable) => any) => void;
  size: number;
  [Symbol.iterator]: () => Iterator<[RDF.Variable, RDF.Term]>;
}

/*
 * Bindings objects are created using a dedicated factory, keeping in line
 * with DataFactory.quad(). This also helps with facilitating support for
 * immutability. Basic helper methods must also be provided for the most 
 * common manipulations of bindings objects.
 */
interface BindingsFactory {
  bindings: (entries?: [RDF.Variable, RDF.Term][]) => Bindings;
  filter: (bindings: Bindings, fn: (value: RDF.Term, key: RDF.Variable) => boolean) => Bindings;
  map: (bindings: Bindings, fn: (value: RDF.Term, key: RDF.Variable) => RDF.Term) => Bindings;
  merge: (left: Bindings, right: Bindings) => Bindings;
  mergeWith: (
    merger: (left: RDF.Term, right: RDF.Term, key: RDF.Variable) => RDF.Term,
    left: Bindings,
    right: Bindings,
  ) => Bindings;
  set: (bindings: Bindings, key: RDF.Variable, value: RDF.Term) => Bindings;
  delete: (bindings: Bindings, key: RDF.Variable) => Bindings;
}

/*
 * Base interfaces to represent query results. These interfaces are generic
 * with respect to the types of query metadata objects. These can be extended
 * by implementors.
 */

interface QueryableResultMetadata<OrderItemsType extends TermName | RDF.Variable> {
  cardinality?: number;
  availableOrders?: QueryOperationOrder<OrderItemsType>[];
  [key: string]: any;
}

interface QueryableResultBindings {
  type: 'bindings';
  execute(opts?: { order?: QueryOperationOrder<RDF.Variable> }): Promise<Stream<Bindings>>;
  variables: RDF.Variable[];
  metadata(opts: { [key: string]: any }): Promise<QueryableResultMetadata<RDF.Variable>>;
}
    
interface QueryableResultQuads {
  type: 'quads';
  execute(opts?: { order?: QueryOperationOrder<TermName> }): Promise<Stream<RDF.Quad>>;
  metadata(opts: { [key: string]: any }): Promise<QueryableResultMetadata<TermName>>;
}

interface QueryableResultBoolean {
  type: 'boolean';
  execute(): Promise<boolean>;
}

interface QueryableResultVoid {
  type: 'void';
  execute(): Promise<void>;
}

type QueryableResult = QueryableResultBindings | QueryableResultBoolean | QueryableResultQuads | QueryableResultVoid;

/*
 * Context objects provide a way to pass additional bits information to
 * implementors, such as but not limited to:
 * - data sources
 * - base IRI for IRI resolution
 * - timestamp for expression evaluation
 * - query language
 * - ...
 */

// SourceType can be anything the query engine defines
// TODO: we may consider defining some standards, like 'string', RDF.Source, ...
interface QueryableContext<SourceType> {
  sources: [SourceType, ...SourceType[]];
  queryTimestamp?: Date; // Required for certain SPARQL operations such as NOW().
  [key: string]: any;
}
    
interface QueryableStringContext<SourceType> extends QueryableContext<SourceType> {
  queryFormat?: QueryableFormat; // defaults to { language: 'SPARQL', version: '1.1', extensions: [] }
  baseIRI?: string; // Required for parsing SPARQL queries
};

interface QueryableAlgebraContext<SourceType> extends QueryableContext<SourceType> {};
    
interface QueryableFormat {
  language: string; // Like 'SPARQL'
  version: string; // Like '1.1'
  extensions: string[]; // TODO: leave the syntax of these extensions open for now?
}

/**
 * Placeholder to represent SPARQL Algebra trees.
 * Algebra typings are TBD. Reference implementations include:
 * - https://www.npmjs.com/package/sparqlalgebrajs
 */
type Algebra = any;

/* 
 * Generic query interfaces. These allow engines to return any type of result
 * object for any type of query, supporting the kind of flexibility required
 * by engines such as Comunica.
 */

interface Queryable<SourceType, ResultType extends QueryableResult> {
  query(query: string, context?: QueryableStringContext<SourceType>): Promise<ResultType>;
}
    
interface QueryableAlgebra<SourceType, ResultType extends QueryableResult> {
  query(query: Algebra, context?: QueryableAlgebraContext<SourceType>): Promise<ResultType>;
}

/*
 * SPARQL-constrainted query interfaces. These interfaces guarantee that result
 * objects are of the expected type as defined by the SPARQL spec.
 */

interface QueryableSparql<SourceType> {
  boolean?(query: string, context?: QueryableContext<SourceType>): Promise<QueryableResultBoolean>;
  bindings?(query: string, context?: QueryableContext<SourceType>): Promise<QueryableResultBindings>;
  quads?(query: string, context?: QueryableContext<SourceType>): Promise<QueryableResultQuads>;
  void?(query: string, context?: QueryableContext<SourceType>): Promise<QueryableResultVoid>;
}

interface QueryableAlgebraSparql<SourceType> {
  boolean?(query: Algebra, context?: QueryableAlgebraContext<SourceType>): Promise<QueryableResultBoolean>;
  bindings?(query: Algebra, context?: QueryableAlgebraContext<SourceType>): Promise<QueryableResultBindings>;
  quads?(query: Algebra, context?: QueryableAlgebraContext<SourceType>): Promise<QueryableResultQuads>;
  void?(query: Algebra, context?: QueryableContext<SourceType>): Promise<QueryableResultVoid>;
}
