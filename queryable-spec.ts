
import RDF from '@rdfjs/types';
import {Algebra} from 'sparqlalgebrajs';
import {EventEmitter} from 'events'; // TODO: refer to underlying interface, not to the class

/*
 * Helper union type 
 */
type termName = 'subject' | 'predicate' | 'object' | 'graph';

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
  merge(bindings: Bindings[]): Bindings;
}

/*
 * Base interfaces to represent query results. These interfaces are generic
 * with respect to the types of query metadata objects. These can be extended
 * by implementors.
 */

interface BaseQueryResultMetadata<OrderItemsType> {
  cardinality?: number; // Cardinality estimate
  order?: OrderItemsType[];
}

interface BaseQueryResult<MetadataType extends BaseQueryResultMetadata<RDF.Variable | termName>> {
  type: 'bindings' | 'quads' | 'boolean';
  metadata(opts: Partial<Record<keyof MetadataType, boolean>>): Promise<MetadataType>;
}

interface QueryResultBindings<MetadataType extends BaseQueryResultMetadata<RDF.Variable>> extends BaseQueryResult<MetadataType> {
  type: 'bindings';
  bindings(): Promise<Bindings[]>;
  stream(): Stream<Bindings>;
  variables: RDF.Variable[];
}
    
interface QueryResultQuads<MetadataType extends BaseQueryResultMetadata<termName>> extends BaseQueryResult<MetadataType> {
  type: 'quads';
  quads(): Promise<RDF.Quad[]>;
  stream(): Stream<RDF.Quad>;
}

interface QueryResultBoolean<MetadataType extends BaseQueryResultMetadata<any>> extends BaseQueryResult<MetadataType> {
  type: 'boolean';
  value: Promise<boolean>;
}

type QueryResult<M> = QueryResultBindings<M> | QueryResultQuads<M> | QueryResultBoolean<M>;

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
  query<MetadataType, ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResult<MetadataType>>;
}
    
interface QueryableAlgebra<SourceType> {
  query<MetadataType, ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra, context?: ContextType): Promise<QueryResult<MetadataType>>;
}

/*
 * SPARQL-constrainted query interfaces. These interfaces guarantee that result
 * objects are of the expected type as defined by the SPARQL spec.
 */

interface QueryableSparql<SourceType> {
  ask?<MetadataType, ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultBoolean<MetadataType>>;
  select?<MetadataType, ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultBindings<MetadataType>>;
  construct?<MetadataType, ContextType extends QueryStringContext<SourceType>>(query: string, context?: ContextType): Promise<QueryResultQuads<MetadataType>>;
}

interface QueryableAlgebraSparql<SourceType> {
  ask?<MetadataType, ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Ask, context?: ContextType): Promise<QueryResultBoolean<MetadataType>>;
  select?<MetadataType, ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Project, context?: ContextType): Promise<QueryResultBindings<MetadataType>>;
  construct?<MetadataType, ContextType extends QueryAlgebraContext<SourceType>>(query: Algebra.Construct, context?: ContextType): Promise<QueryResultQuads<MetadataType>>;
}
