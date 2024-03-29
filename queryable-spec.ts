
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

interface QueryResultCardinality {
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
}

/**
 * A QueryResultMetadata is an object that contains metadata about a certain
 * query result.
 */

interface CardinalityMetadataOpts { 
  cardinality: 'estimate' | 'exact'; 
};

interface AvailableOrdersMetadataOpts {
  availableOrders: true;
};

interface BaseMetadataQuery<OrderItemsType extends TermName | RDF.Variable, AdditionalMetadataType extends {}> {
  metadata<M extends CardinalityMetadataOpts | AvailableOrdersMetadataOpts>(opts?: M): Promise<
    AdditionalMetadataType 
      & (M extends CardinalityMetadataOpts ? { cardinality: QueryResultCardinality } : {})
      & (M extends AvailableOrdersMetadataOpts ? { availableOrders: QueryOperationOrder<OrderItemsType>[] } : {})
  >;
}

interface QueryExecuteOptions<OrderItemsType extends TermName | RDF.Variable> {
  
  /**
   * TBD
   */
  order?: QueryOperationOrder<OrderItemsType>['terms'];

  /**
   * Custom properties
   */
  [key: string]: any;
}

/**
 * Generic interface that defines the API pattern for query objects.
 */
interface BaseQuery {
  
  resultType: string;

  /**
   * Returns either a stream containing all the items that match the given query,
   * a boolean or void depending on the semantics of the given query.
   */
  execute(opts?: any): Promise<Stream<any> | boolean | void>;
}

interface QueryBindings extends BaseQuery, BaseMetadataQuery<RDF.Variable, { variables: RDF.Variable[] }> {
  resultType: 'bindings';
  execute(opts?: QueryExecuteOptions<RDF.Variable>): Promise<Stream<Bindings>>;
}
    
interface QueryQuads extends BaseQuery, BaseMetadataQuery<TermName, {}> {
  resultType: 'quads';
  execute(opts?: QueryExecuteOptions<TermName>): Promise<Stream<RDF.Quad>>;
}

interface QueryBoolean extends BaseQuery {
  resultType: 'boolean';
  execute(): Promise<boolean>;
}

interface QueryVoid extends BaseQuery {
  resultType: 'void';
  execute(): Promise<void>;
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

  /**
   * May reject given an unsupported expression.
   */
  matchExpression(
    subject?: RDF.Term,
    predicate?: RDF.Term,
    obj?: RDF.Term,
    graph?: RDF.Term,
    expression?: Expression,
    opts?: { 
      length?: number; 
      start?: number; 
    },
  ): Promise<QueryQuads>;
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

  /**
   * Returns undefined in the presence of merge conflicts, that is when `left`
   * and `right` both include a common variable (key) set to different terms
   * (values).
   */
  merge: (left: Bindings, right: Bindings) => Bindings | undefined;
  mergeWith: (
    merger: (left: RDF.Term, right: RDF.Term, key: RDF.Variable) => RDF.Term,
    left: Bindings,
    right: Bindings,
  ) => Bindings;
  set: (bindings: Bindings, key: RDF.Variable, value: RDF.Term) => Bindings;
  delete: (bindings: Bindings, key: RDF.Variable) => Bindings;
}

type Query = QueryBindings | QueryBoolean | QueryQuads | QueryVoid;

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
interface QueryContext<SourceType> {
  sources: [SourceType, ...SourceType[]];
  queryTimestamp?: Date; // Required for certain SPARQL operations such as NOW().
  [key: string]: any;
}
    
interface QueryStringContext<SourceType> extends QueryContext<SourceType> {
  queryFormat?: QueryFormat; // defaults to { language: 'SPARQL', version: '1.1', extensions: [] }
  baseIRI?: string; // Required for parsing SPARQL queries
};

interface QueryAlgebraContext<SourceType> extends QueryContext<SourceType> {};
    
interface QueryFormat {
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

interface Queryable<QueryFormatType extends string | Algebra, SourceType, QueryType extends Query> {
  /**
   * May reject given an unsupported query.
   */
  query(query: QueryFormatType, context?: QueryStringContext<SourceType>): Promise<QueryType>;
}

/*
 * SPARQL-constrainted query interfaces. These interfaces guarantee that result
 * objects are of the expected type as defined by the SPARQL spec.
 */

type BindingsResult = { bindings: true };
type VoidResult = { void: true };
type QuadsResult = { quads: true };
type BooleanResult = { boolean: true };

type SparqlQueryable<QueryFormatType extends string | Algebra, SourceType, SupportedResultType> = {}
  & (SupportedResultType extends BindingsResult ? {
    queryBindings(query: QueryFormatType, context?: QueryStringContext<SourceType>): Promise<Stream<Bindings>>;
  } : {})
  & (SupportedResultType extends BooleanResult ? {
    queryBoolean(query: QueryFormatType, context?: QueryStringContext<SourceType>): Promise<boolean>;
  } : {})
  & (SupportedResultType extends QuadsResult ? {
    queryQuads(query: QueryFormatType, context?: QueryStringContext<SourceType>): Promise<Stream<RDF.Quad>>;
  } : {}) 
  & (SupportedResultType extends VoidResult ? {
    queryVoid(query: QueryFormatType, context?: QueryStringContext<SourceType>): Promise<void>;
  } : {})
;
