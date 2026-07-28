export const placeProfileContext =
  'https://data.surinametijdmachine.org/data/context/stm-v1.jsonld';

type JsonObject = Record<string, unknown>;

export type PlaceRecordDocument = JsonObject & {
  '@graph'?: JsonObject[];
  '@id'?: string;
};

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function strings(value: unknown): string[] {
  return values(value).filter((item): item is string => typeof item === 'string');
}

function firstString(value: unknown): string | undefined {
  return strings(value)[0];
}

function compactType(value: unknown): string[] {
  const aliases: Record<string, string> = {
    'crm:E13_Attribute_Assignment': 'AttributeAssignment',
    'crm:E17_Type_Assignment': 'TypeAssignment',
    'crm:E25_Human_Made_Feature': 'HumanMadeFeature',
    'crm:E26_Physical_Feature': 'PhysicalFeature',
    'crm:E41_Appellation': 'Name',
    'crm:E42_Identifier': 'Identifier',
    'crm:E52_Time-Span': 'TimeSpan',
    'crm:E53_Place': 'Place',
    'crm:E74_Group': 'Group',
    'geo:Geometry': 'Geometry',
    'stm:AuthorityRecord': 'AuthorityRecord',
  };
  return strings(value).map((type) => aliases[type] ?? type);
}

function typeValue(value: unknown): string | string[] | undefined {
  const types = compactType(value);
  if (types.length === 0) return undefined;
  return types.length === 1 ? types[0] : types;
}

function reference(
  id: string | undefined,
  nodeById: Map<string, JsonObject>,
  fallbackType?: string,
): JsonObject | undefined {
  if (!id) return undefined;
  const node = nodeById.get(id);
  const type = typeValue(node?.['@type']) ?? fallbackType;
  const label = firstString(node?.['rdfs:label']);
  return {
    id,
    ...(type ? { type } : {}),
    ...(label ? { _label: label } : {}),
  };
}

function references(
  value: unknown,
  nodeById: Map<string, JsonObject>,
  fallbackType?: string,
): JsonObject[] {
  return strings(value).flatMap((id) => {
    const item = reference(id, nodeById, fallbackType);
    return item ? [item] : [];
  });
}

function wkt(node: JsonObject | undefined): string | undefined {
  const value = node?.['geo:asWKT'];
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const literal = (value as JsonObject)['@value'];
  return typeof literal === 'string' ? literal : undefined;
}

function assignment(
  node: JsonObject,
  nodeById: Map<string, JsonObject>,
): JsonObject {
  const id = firstString(node['@id']);
  const spanId = firstString(node.P4_has_time_span);
  const span = spanId ? nodeById.get(spanId) : undefined;
  const result: JsonObject = {
    ...(id ? { id } : {}),
    ...(typeValue(node['@type']) ? { type: typeValue(node['@type']) } : {}),
  };
  const classification = references(node.P2_has_type, nodeById, 'Type');
  const assigned = references(node.P141_assigned, nodeById);
  const assignedType = references(node.P42_assigned, nodeById, 'Type');
  const evidence = references(node['prov:hadPrimarySource'], nodeById);
  const derivedFrom = references(node['prov:wasDerivedFrom'], nodeById);
  if (classification.length > 0) result.classified_as = classification;
  if (assigned.length > 0) result.assigned = assigned;
  if (assignedType.length > 0) result.assigned_type = assignedType;
  if (spanId) {
    result.timespan = {
      id: spanId,
      ...(typeValue(span?.['@type'])
        ? { type: typeValue(span?.['@type']) }
        : { type: 'TimeSpan' }),
      ...(firstString(span?.['rdfs:label'])
        ? { _label: firstString(span?.['rdfs:label']) }
        : {}),
      ...(firstString(span?.P82a_begin_of_the_begin)
        ? { begin_of_the_begin: firstString(span?.P82a_begin_of_the_begin) }
        : {}),
      ...(firstString(span?.P82b_end_of_the_end)
        ? { end_of_the_end: firstString(span?.P82b_end_of_the_end) }
        : {}),
    };
  }
  if (evidence.length > 0) result.evidence = evidence;
  if (derivedFrom.length > 0) result.derived_from = derivedFrom;
  if (firstString(node.certainty)) {
    result.certainty = reference(firstString(node.certainty), nodeById, 'Type');
  }
  for (const [source, target] of [
    ['P3_has_note', 'note'],
    ['standardizedContent', 'standardized_content'],
    ['sourceContent', 'source_content'],
    ['sourceRow', 'source_row'],
  ] as const) {
    const items = values(node[source]);
    if (items.length === 1) result[target] = items[0];
    else if (items.length > 1) result[target] = items;
  }
  return result;
}

function assignmentsFor(
  targetId: string,
  graph: JsonObject[],
  nodeById: Map<string, JsonObject>,
  targetProperty: 'P140_assigned_attribute_to' | 'P41_classified',
): JsonObject[] {
  return graph
    .filter((node) => strings(node[targetProperty]).includes(targetId))
    .map((node) => assignment(node, nodeById));
}

function nameObject(
  node: JsonObject,
  nodeById: Map<string, JsonObject>,
): JsonObject {
  const classifiedAs = references(node.P2_has_type, nodeById, 'Type');
  const language = references(node.P72_has_language, nodeById);
  const carriedBy = references(node.P128i_is_carried_by, nodeById);
  return {
    id: node['@id'],
    type: 'Name',
    ...(node.P190_has_symbolic_content != null
      ? { content: node.P190_has_symbolic_content }
      : {}),
    ...(classifiedAs.length > 0 ? { classified_as: classifiedAs } : {}),
    ...(language.length > 0 ? { language } : {}),
    ...(carriedBy.length > 0 ? { carried_by: carriedBy } : {}),
  };
}

function identifierObject(
  node: JsonObject,
  nodeById: Map<string, JsonObject>,
): JsonObject {
  const classifiedAs = references(node.P2_has_type, nodeById, 'Type');
  return {
    id: node['@id'],
    type: 'Identifier',
    ...(node.P190_has_symbolic_content != null
      ? { content: node.P190_has_symbolic_content }
      : {}),
    ...(classifiedAs.length > 0 ? { classified_as: classifiedAs } : {}),
  };
}

function compactFeature(
  feature: JsonObject,
  graph: JsonObject[],
  nodeById: Map<string, JsonObject>,
): JsonObject {
  const id = firstString(feature['@id'])!;
  const classifiedAs = references(feature.P2_has_type, nodeById, 'Type');
  const attributedBy = assignmentsFor(
    id,
    graph,
    nodeById,
    'P140_assigned_attribute_to',
  );
  const classifiedBy = assignmentsFor(id, graph, nodeById, 'P41_classified');
  const result: JsonObject = {
    id,
    ...(typeValue(feature['@type']) ? { type: typeValue(feature['@type']) } : {}),
    ...(firstString(feature['rdfs:label'])
      ? { _label: firstString(feature['rdfs:label']) }
      : {}),
  };
  if (classifiedAs.length > 0) result.classified_as = classifiedAs;
  if (attributedBy.length > 0) result.attributed_by = attributedBy;
  if (classifiedBy.length > 0) result.classified_by = classifiedBy;

  const associationStatus = firstString(feature.organizationAssociationStatus);
  const associatedOrganizations =
    associationStatus === 'linked'
      ? references(feature.hasOrganizationalAssociation, nodeById, 'Group')
      : [];
  if (associatedOrganizations.length > 0) {
    result.associated_organizations = associatedOrganizations;
  }
  if (associationStatus) {
    result.organization_association_status = associationStatus;
  }

  for (const [source, target] of [
    ['skos:exactMatch', 'exact_match'],
    ['skos:closeMatch', 'close_match'],
    ['skos:broadMatch', 'broad_match'],
    ['skos:narrowMatch', 'narrow_match'],
    ['skos:relatedMatch', 'related_match'],
    ['prov:wasDerivedFrom', 'derived_from'],
  ] as const) {
    const items = references(feature[source], nodeById);
    if (items.length > 0) result[target] = items;
  }
  return result;
}

/**
 * Project a generated STM authority-record graph to a single-root Place
 * object. All nested entities retain their existing identifiers.
 */
export function buildReadablePlaceObject(
  document: PlaceRecordDocument,
  context = placeProfileContext,
): JsonObject {
  const pageId = firstString(document['@id']);
  const graph = document['@graph'] ?? [];
  if (!pageId || graph.length === 0) {
    throw new Error('The readable Place profile requires a place record graph');
  }

  const nodeById = new Map(
    graph.flatMap((node) => {
      const id = firstString(node['@id']);
      return id ? [[id, node] as const] : [];
    }),
  );
  const locationId = `${pageId}#location`;
  const location = nodeById.get(locationId);
  if (!location || !compactType(location['@type']).includes('Place')) {
    throw new Error('The place record has no E53 Place location node');
  }
  const record = nodeById.get(`${pageId}#record`);
  const featureId = `${pageId}#feature`;
  const feature = nodeById.get(featureId);
  const names = strings(location.P1_is_identified_by).flatMap((id) => {
    const node = nodeById.get(id);
    return node ? [nameObject(node, nodeById)] : [];
  });
  const identifiers = strings(location.P48_has_preferred_identifier).flatMap(
    (id) => {
      const node = nodeById.get(id);
      return node ? [identifierObject(node, nodeById)] : [];
    },
  );
  const structuralTypes = references(
    feature?.P2_has_type ?? location.P2_has_type,
    nodeById,
    'Type',
  );
  const geometryId = firstString(location['geo:hasGeometry']);
  const centroidId = firstString(location['geo:hasCentroid']);
  const attributedBy = assignmentsFor(
    locationId,
    graph,
    nodeById,
    'P140_assigned_attribute_to',
  );
  const classifiedBy = assignmentsFor(
    locationId,
    graph,
    nodeById,
    'P41_classified',
  );
  const derivedFrom = references(location['prov:wasDerivedFrom'], nodeById);

  const result: JsonObject = {
    '@context': context,
    id: locationId,
    type: 'Place',
    _label:
      firstString(location['rdfs:label']) ??
      firstString(feature?.['rdfs:label']) ??
      firstString(record?.['rdfs:label']) ??
      pageId,
    documented_by: [
      {
        id: `${pageId}#record`,
        type: 'AuthorityRecord',
        ...(firstString(record?.['rdfs:label'])
          ? { _label: firstString(record?.['rdfs:label']) }
          : {}),
      },
    ],
  };
  if (structuralTypes.length > 0) result.classified_as = structuralTypes;
  if (names.length + identifiers.length > 0) {
    result.identified_by = [...names, ...identifiers];
  }
  const descriptions = strings(location.P3_has_note);
  if (descriptions.length > 0) {
    result.referred_to_by = descriptions.map((content) => ({
      type: 'LinguisticObject',
      content,
    }));
  }
  const geometryWkt = wkt(geometryId ? nodeById.get(geometryId) : undefined);
  if (geometryWkt) result.defined_by = geometryWkt;
  const centroidWkt = wkt(centroidId ? nodeById.get(centroidId) : undefined);
  if (centroidId && centroidWkt) {
    result.centroid = {
      id: centroidId,
      type: 'Geometry',
      as_wkt: centroidWkt,
    };
  }
  const parent = reference(
    firstString(location.P89_falls_within),
    nodeById,
    'Place',
  );
  if (parent) result.part_of = [parent];
  if (feature) {
    result.related_features = [
      compactFeature(feature, graph, nodeById),
    ];
  }
  if (attributedBy.length > 0) result.attributed_by = attributedBy;
  if (classifiedBy.length > 0) result.classified_by = classifiedBy;
  if (derivedFrom.length > 0) result.derived_from = derivedFrom;
  return result;
}
