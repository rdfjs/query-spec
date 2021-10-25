
import RDF from '@rdfjs/types';
import {Algebra} from 'sparqlalgebrajs';
import {EventEmitter} from 'events'; // TODO: refer to underlying interface, not to the class

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

/*
 * Map-like representation of Bindings as using plain objects could lead
 * to collisions between variable names and object properties.
 * Long-term goal: maintain compatibility with the native Map class.
 */ 
interface Bindings {
  type: 'bindings';
  get(variable: RDF.Variable): RDF.Term;
  keys(): RDF.Variable[];
  entries(): [RDF.Variable, RDF.Term][];
  size: number;
}

/*
 * Bindings objects are created using a dedicated factory, keeping in line
 * with DataFactory.quad(). This also helps with facilitating support for
 * immutability. Basic helper methods must also be provided for the most 
 * common manipulations of bindings objects.
 */
interface BindingsFactory {
  bindings(entries: [RDF.Variable, RDF.Term][]): Bindings;
  // NOTE: returns undefined in case of conflicting bindings, i.e. bindings
  //       having the same variables.
  merge(bindings: Bindings[]): Bindings|undefined;
}

/*
 * Base interfaces to represent query results. These interfaces are generic
 * with respect to the types of query metadata objects. These can be extended
 * by implementors.
 */

interface QueryResultMetadata<OrderItemsType> {
  cardinality?: number;
  order?: OrderItemsType[];
  [key: string]: any;
}

interface BaseQueryResult<MetadataOrderType> {
  type: 'bindings' | 'quads' | 'boolean';
  metadata(opts: { [key: string]: any }): Promise<QueryResultMetadata<MetadataOrderType>>;
}

interface QueryResultBindings extends BaseQueryResult<RDF.Variable> {
  type: 'bindings';
  stream(): Stream<Bindings>;
  variables: RDF.Variable[];
}
    
interface QueryResultQuads extends BaseQueryResult<TermName> {
  type: 'quads';
  stream(): Stream<RDF.Quad>;
}

interface QueryResultBoolean extends BaseQueryResult<any> {
  type: 'boolean';
  value(): Promise<boolean>;
}

type QueryResult = QueryResultBindings | QueryResultQuads | QueryResultBoolean;/*
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
  
type Algebra = {}; // TODO: define this (possible starting point: https://github.com/joachimvh/SPARQLAlgebra.js)

/* 
 * Generic query interfaces. These allow engines to return any type of result
 * object for any type of query, supporting the kind of flexibility required
 * by engines such as Comunica.
 */

interface Queryable<SourceType> {
  query<MetadataType, ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResult>;
}
    
interface QueryableAlgebra<SourceType> {
  query<MetadataType, ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra, context?: ContextType): Promise<QueryResult>;
}

/*
 * SPARQL-constrainted query interfaces. These interfaces guarantee that result
 * objects are of the expected type as defined by the SPARQL spec.
 */

interface QueryableSparql<SourceType> {
  boolean?<ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultBoolean>;
  bindings?<ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultBindings>;
  quads?<ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultQuads>;
}

interface QueryableAlgebraSparql<SourceType> {
  boolean?<ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Ask, context?: ContextType): Promise<QueryResultBoolean>;
  bindings?<ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Project, context?: ContextType): Promise<QueryResultBindings>;
  quads?<ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Construct, context?: ContextType): Promise<QueryResultQuads>;
}
