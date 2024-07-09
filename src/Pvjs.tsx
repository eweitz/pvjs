import {
  find,
  forOwn,
  fromPairs,
  omit,
  partition,
  reduce,
  toPairs,
  values
} from "lodash";
import { get, isString, isEmpty, negate } from "lodash/fp";
//import { BridgeDb, XrefsAnnotationPanel } from "bridgedb";
import { Validator } from "collit";
import * as React from "react";
import * as ReactDOM from "react-dom";
// TODO look at how to properly import this so it works
// for both es5, esnext, tree-shaking, etc.
//import { Kaavio } from "kaavio";
import { Kaavio } from "eweitz-kaavio/esnext/Kaavio";

// The edge drawing definitions are in Kaavio because they can be generically used.
// But the icons and markers are specific to Pvjs (less likely to useful to other applications).
import * as themePlain from "./themes/plain/theme";
import * as themeDark from "./themes/dark/theme";
// // TODO make the CLI bundler include the styles
// const ContainerCustomStyle = require("./themes/styles/Container.css");
// const DiagramCustomStylePlain = require("./themes/styles/Diagram.plain.css");
// const DiagramCustomStyleDark = require("./themes/styles/Diagram.dark.css");
const ContainerCustomStyle = `
.Container {
  background-color: white;
}`;

const DiagramCustomStylePlain = `
/* Hide the top-level citation numbers */
.Viewport > .Citation > .Text {
  font-size: 0px;
}

/* Hide the InfoBox */
.Viewport > .Text {
  font-size: 0;
}

/* TODO: having a thin stroke might help with contrast for
 * certain foreground/background combos. Should we use a
 * stroke of 0.05px and maybe apply an invert filter? */
.Text {
  stroke: none;
}

.DataNode {
  stroke-miterlimit: 1;
}

.DataNode:hover {
  cursor: pointer;
}

.DataNode .Highlighted {
  opacity: 0.6;
  stroke-width: 0px;
}

.Citation .Icon {
  fill: none;
  stroke-width: 0px;
}

.Citation .Text {
  text-align: center;
  vertical-align: top;
  font-size: 7px;
  fill: #999999;
  fill-opacity: 1;
  stroke: none;
}`;

const DiagramCustomStyleDark = `
.Viewport > .Icon {
  filter: url(#Invert95);
}

/* Hide the InfoBox */
.Viewport > .Text {
  font-size: 0;
}

.Edge > path {
  stroke-width: 1.1px;
}

.Viewport .DataNode,
.Group .DataNode,
.Viewport .Group .Icon {
  /*
  filter: url(#Invert95);
*/
  /*stroke-miterlimit: 1;*/
  /*filter: drop-shadow( 5px 5px 5px red );*/
  /*filter: drop-shadow(16px 16px 20px black);*/
  /* Same syntax as box-shadow */
  /*
  filter: drop-shadow( 2px 2px 2px #000 );
  -webkit-filter: drop-shadow( 2px 2px 2px #000 );
  */
}

.GroupGroup > .Icon {
  fill: transparent;
  stroke-width: 0px;
}

.GroupComplex > .Icon {
  fill: #b4b464;
  fill-opacity: 0.1;
  stroke: #808080;
}

.GroupNone > .Icon {
  fill: #b4b464;
  fill-opacity: 0.1;
  stroke: #808080;
}

.GroupPathway > .Icon {
  fill: #008000;
  fill-opacity: 0.05;
  stroke: #808080;
}

.CellularComponent > .Icon {
  color: orange;
  fill: pink;
  fill-opacity: 0.05;
  stroke: orange;
}

.Label > .Icon {
  color: transparent;
  fill: none;
  fill-opacity: 0;
  stroke: none;
  /*filter: url(#Invert95);*/
}
.Label > .Text {
  fill: #fefefe;
  /*filter: url(#Invert95);*/
}

.DataNode > .Icon {
  /* clip-path needed because rx & ry don't work in FF or Safari */
  clip-path: url(#ClipPathRoundedRectangle);
  rx: 15px;
  ry: 15px;
  stroke-width: 0px;
}
.DataNode > .Text {
  font-weight: bold;
}
.DataNode:hover {
  cursor: pointer;
}

.DataNode.GeneProduct > .Icon {
  fill: #f4d03f;
}
.DataNode.GeneProduct .Text {
  fill: #333;
}

.DataNode.Protein > .Icon {
  fill: brown;
}
.DataNode.Protein > .Text {
  fill: #fefefe;
}

.DataNode.Rna > .Icon {
  fill: #9453a7;
}
.DataNode.Rna > .Text {
  fill: #ecf0f1;
}

.DataNode.Pathway > .Icon {
  filter: url(#WhiteToGreen);
  /*
  fill: #75C95C;
  */
  /* NOTE: Uncomment the line below to see an example
   *      of adding a dropshadow to Pathway DataNodes: */
  /*filter: 'drop-shadow( 2px 2px 2px #000 )'; */
}
.DataNode.Pathway > .Text {
  filter: url(#Invert100);
  /*fill: #1C2833;*/
}

.DataNode.Metabolite > .Icon {
  fill: #0000ee;
}
.DataNode.Metabolite > .Text {
  fill: #fefefe;
}

.DataNode > State {
  filter: url(#WhiteTo33BFFF);
}

.Interaction {
  filter: url(#Invert95);
  stroke-width: 1.3;
}

.Stimulation {
  filter: url(#BlackToGreen);
}

.Inhibition {
  filter: url(#BlackToRed);
}

.Citation .Text {
  fill: gray;
  font-size: 10px;
}`

const themeFor = {
  plain: {
    containerStyle: ContainerCustomStyle,
    diagramStyle: DiagramCustomStylePlain,
    ...themePlain
  },
  dark: {
    containerStyle: ContainerCustomStyle,
    diagramStyle: DiagramCustomStyleDark,
    ...themeDark
  }
};

// TODO use TS types updated for version 16. But I also have some changes
// I made for SVG attributes that need to get merged.
const Fragment = React["Fragment"];

export interface PvjsProps {
  //theme: string;
  theme: "plain" | "dark";
  pathway: Record<string, any>;
  entitiesById: Record<string, any>;

  opacities: string[];
  highlights: string[];
  panned: string[];
  zoomed: string[];
  detailPanelOpen: boolean;
  selected: null | Record<string, any>;
}

// TODO move this into utils
// Create a string of citation numbers for display,
// delimited by commas, and
// replacing any consecutive series of numbers with the
// first and last joined by a hyphen.
function createPublicationXrefString(displayNumbers) {
  var publicationXrefString;
  if (displayNumbers.length === 1) {
    publicationXrefString = displayNumbers[0];
  } else {
    displayNumbers.sort(function(a, b) {
      return a - b;
    });
    var i = 0;
    publicationXrefString = displayNumbers[i].toString();

    if (displayNumbers.length > 2) {
      do {
        i += 1;

        if (
          displayNumbers[i - 1] + 1 !== displayNumbers[i] ||
          displayNumbers[i] + 1 !== displayNumbers[i + 1]
        ) {
          if (i !== 1) {
            if (displayNumbers[i - 2] + 2 === displayNumbers[i]) {
              publicationXrefString += "-" + displayNumbers[i].toString();
            } else {
              publicationXrefString += ", " + displayNumbers[i].toString();
            }
          } else {
            publicationXrefString += ", " + displayNumbers[i].toString();
          }
        }
      } while (i < displayNumbers.length - 2);
    }

    i += 1;

    if (displayNumbers[i - 2] + 2 === displayNumbers[i]) {
      publicationXrefString += "-" + displayNumbers[i].toString();
    } else {
      publicationXrefString += ", " + displayNumbers[i].toString();
    }
  }

  return publicationXrefString;
}

function normalizeTargetValue(targetValue) {
  return targetValue.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanQueryParam(input: string) {
  return input.replace(/[^\w\-\:]/g, "");
}

// TODO reconcile query params and class props for pan/zoom settings
const pluralForOperationName = {
  highlight: "highlights",
  opacity: "opacities"
};
const parseForOperationName = {
  highlight: function(h) {
    if (Validator.isColor(h)) {
      return h;
    }
    const hexed = `#${h}`;
    if (Validator.isColor(hexed)) {
      return hexed;
    } else {
      console.warn(`Cannot parse color "${h}"`);
    }
  },
  opacity: parseFloat
};
function reconcileQueryParam(
  operationNameSingular,
  styleValuesByNormalizedTargetValues,
  queryParamKey,
  queryParamValue
) {
  let result = [];
  if (queryParamKey.indexOf(`${operationNameSingular}-`) === 0) {
    const targetValue = queryParamKey.replace(`${operationNameSingular}-`, "");
    const normalizedTargetValue = normalizeTargetValue(targetValue);
    if (normalizedTargetValue in styleValuesByNormalizedTargetValues) {
      const prop = styleValuesByNormalizedTargetValues[normalizedTargetValue];
      console.warn(`Warning: "${operationNameSingular}" was specified by two different sources, which may or may not conflict.
				prop passed to Pvjs class:
					${operationNameSingular}={${JSON.stringify(prop)}}
				URL query param:
					${queryParamKey}=${queryParamValue}
				Setting URL query param to match prop passed to Pvjs class.`);

      const searchParams = new URLSearchParams(location.search);
      searchParams.set(queryParamKey, prop);

      history.replaceState(
        { queryParamKey },
        document.title,
        "?" + searchParams.toString()
      );
    } else {
      result.push([
        null,
        cleanQueryParam(targetValue),
        parseForOperationName[operationNameSingular](
          cleanQueryParam(queryParamValue)
        )
      ]);
      //result = [null, normalizedTargetValue, queryParamValue];
    }
  }
  return result;
}

export class Pvjs extends React.Component<any, any> {
  kaavioRef: any;
  detailsPanelRef: any;
  static defaultProps = {
    theme: "plain",
    opacities: [],
    highlights: [],
    panned: [],
    zoomed: [],
    pathway: {},
    entitiesById: {},
    detailPanelOpen: false,
    selected: null
  };

  constructor(props: PvjsProps) {
    super(props);
    const updatedProps = this.reconcileQueryParams(props);

    this.state = {
      detailPanelOpen: props.detailPanelOpen,
      selected: props.selected
    };
  }

  reconcileQueryParams(props) {
    // http://localhost:5983/?highlight-Cholesterol=yellow&highlight-ChEBI-35664=purple&highlight-hmdb-HMDB01206=blue&opacity-Dgat1=0&opacity-ncbigene-11303=0
    // ?highlight-Ensembl-ENSG00000121691=purple&highlight-HMDB-HMDB00193=yellow&highlight-PC=red
    // ?opacity-Ensembl-ENSG00000121691=1.5&opacity-HMDB-HMDB00193=0&opacity-PC=1.5

    const searchParams = Array.from(new URLSearchParams(location.search));

    return toPairs(pluralForOperationName)
      .reduce(function(acc, [operationNameSingular, operationNamePlural]) {
        const styleValuesByNormalizedTargetValues = props[
          operationNamePlural
        ].reduce((acc, [targetKey, targetValue, styleValue]) => {
          acc[targetValue] = styleValue;
          return acc;
        }, {});

        acc.push({
          operationNameSingular,
          operationNamePlural,
          styleValuesByNormalizedTargetValues
        });

        return acc;
      }, [])
      .reduce(function(
        acc,
        {
          operationNameSingular,
          operationNamePlural,
          styleValuesByNormalizedTargetValues
        }
      ) {
        searchParams.forEach(function([queryParamKey, queryParamValue]) {
          reconcileQueryParam(
            operationNameSingular,
            styleValuesByNormalizedTargetValues,
            queryParamKey,
            queryParamValue
          ).forEach(function(item) {
            if (!(operationNamePlural in acc)) {
              acc[operationNamePlural] = [];
            }
            acc[operationNamePlural].push(item);
          });
        });
        return acc;
      },
      props);
    /*
    return toPairs(inputs)
      .reduce(
        function([inputKey, inputValue], { operationNameSingular, operationNamePlural, styleValuesByNormalizedTargetValues }) {
          searchParams.forEach(function(
            [queryParamKey, queryParamValue]
          ) {
            reconcileQueryParam(
              operationNameSingular,
              styleValuesByNormalizedTargetValues,
              queryParamKey,
              queryParamValue
            ).forEach(function(item) {
              subAcc[operationNamePlural].push(item);
            });
            return subAcc;
          });
		return
        },
        {}
      );

    if (!isEmpty(parsed.highlights) || !isEmpty(parsed.opacities)) {
      const entitiesById = this.props.entitiesById;
      const mapper = values(entitiesById).reduce(function(acc, entity) {}, {});
    }
	  //*/
  }

  closeActive() {
    this.setState({ selected: null, detailPanelOpen: false });
  }

  handleEntityClick = entity => {
    const { onEntityClick, detailPanelEnabled = true } = this.props;
    if (onEntityClick) onEntityClick(entity);

    if (
      entity.type.indexOf("DataNode") > -1 &&
      entity.xrefIdentifier &&
      entity.xrefDataSource
    ) {
      this.setState({ selected: entity, detailPanelOpen: detailPanelEnabled });
    }
  };

  //componentWillMount() {}

  /*
  shouldComponentUpdate(nextProps, nextState) {
    const prevProps = this.props;
    const prevState = this.state;

    return [
      "pathway.id",
      "pathway.version",
      "selected",
      "detailPanelOpen",
      "theme"
    ].reduce(function(acc, item) {
      const getter = get(item);
      return acc || getter(prevState) !== getter(nextState);
    }, false);
  }
	//*/

  /*
  componentWillReceiveProps(nextProps) {
    const prevProps = this.props;
	  const updatedProps = ["highlights", "opacities", "pathway", "entitiesById"]
	  .filter(function(propId) {
		  return prevProps[propId] !== nextProps[propId];
	  });
    if (
      nextProps.wpId !== prevProps.wpId ||
      nextProps.version !== prevProps.version
    ) {
      // Reset the state
      this.setState({
        pathway: null,
        entitiesById: null,
        filter: null,
        detailPanelOpen: false,
        selected: null
      });
    }
  }
	//*/

  componentWillUnmount() {
    // TODO cancel any pending network requests, possibly something like this:
    // this.pathwayRequest.dispose();
  }

  onKaavioReady() {
    const { onReady } = this.props;
    if (onReady) {
      const { pathway, entitiesById } = this.state;
      onReady(entitiesById);
    }
  }

  handleCloseDetailsPanel() {
    this.setState({ detailPanelOpen: false });
  }

  renderDetailsPanel() {
    const { organism } = this.props.pathway;
    const { selected, detailPanelOpen } = this.state;
    if (!detailPanelOpen) return null;

    if (window.hasOwnProperty("XrefPanel")) {
      if (!!selected.xrefDataSource && !!selected.xrefIdentifier) {
        window["XrefPanel"]["show"](
          this.detailsPanelRef,
          selected.xrefIdentifier,
          selected.xrefDataSource,
          organism,
          {
            "0": selected.textContent
          }
        );
      }
    }

    /*
    return (
      <XrefsAnnotationPanel
        key="details-panel"
        bridgeDb={new BridgeDb()}
        organism={pvjson.organism}
        entityType={!!selected && selected.wpType}
        displayName={!!selected && selected.textContent}
        xrefDataSource={selected && selected.xrefDataSource}
        xrefIdentifier={!!selected && selected.xrefIdentifier}
        handleClose={_ => this.handleCloseDetailsPanel()}
      />
    );
	//*/
  }

  render() {
    const {
      pathway,
      entitiesById,
      theme,
      wpId,
      showPanZoomControls,
      highlights,
      opacities,
      zoomed,
      panned,
      panCoordinates,
      zoomLevel,
      onPanZoomChange,
      panZoomLocked
    } = this.props;

    return (
      <Fragment>
        <div
          ref={div => {
            this.detailsPanelRef = div;
          }}
        />

        {this.renderDetailsPanel()}

        <Kaavio
          theme={themeFor[theme]}
          pathway={pathway}
          entitiesById={entitiesById}
          onReady={kaavio => this.onKaavioReady()}
          onEntityClick={this.handleEntityClick}
          highlights={highlights}
          opacities={opacities}
          panned={panned}
          zoomed={zoomed}
          panCoordinates={panCoordinates}
          zoomLevel={zoomLevel}
          onPanZoomChange={onPanZoomChange}
          panZoomLocked={panZoomLocked}
          showPanZoomControls={showPanZoomControls}
        />
      </Fragment>
    );
  }
}
