import "./App.css";
import Deck from "./Deck";
import SearchPanel from "./components/SearchPanel";
import useTreenomeState from "./hooks/useTreenomeState";
import useView from "./hooks/useView";
import useGetDynamicData from "./hooks/useGetDynamicData";
import useColor from "./hooks/useColor";
import useSearch from "./hooks/useSearch";
import useColorBy from "./hooks/useColorBy";
import useNodeDetails from "./hooks/useNodeDetails";
import useHoverDetails from "./hooks/useHoverDetails";
import { useMemo, useState, useRef } from "react";
import useBackend from "./hooks/useBackend";
import usePerNodeFunctions from "./hooks/usePerNodeFunctions";
import useConfig from "./hooks/useConfig";
import { useSettings } from "./hooks/useSettings";
import { MdArrowBack, MdArrowUpward } from "react-icons/md";
import { useEffect } from "react";
import { useCallback } from "react";
import getDefaultQuery from "./utils/getDefaultQuery";
import ReactTooltip from "react-tooltip";
import { Toaster } from "react-hot-toast";
import LineageTools from "./components/LineageTools";

const default_query = getDefaultQuery();

function Taxonium({
  sourceData,

  backendUrl,

  configDict,
  configUrl,
  query,

  updateQuery,
  overlayContent,
  setAboutEnabled,
  setOverlayContent,
  setTitle,
}) {
  const [backupQuery, setBackupQuery] = useState(default_query);
  const backupUpdateQuery = useCallback((newQuery) => {
    setBackupQuery((oldQuery) => ({ ...oldQuery, ...newQuery }));
  }, []);
  // if query and updateQuery are not provided, use the backupQuery
  if (!query && !updateQuery) {
    query = backupQuery;
    updateQuery = backupUpdateQuery;
  }

  // if no setTitle, set it to a noop
  if (!setTitle) {
    setTitle = () => {};
  }
  // if no setOverlayContent, set it to a noop
  if (!setOverlayContent) {
    setOverlayContent = () => {};
  }

  // if no setAboutEnabled, set it to a noop
  if (!setAboutEnabled) {
    setAboutEnabled = () => {};
  }

  const deckRef = useRef();
  const jbrowseRef = useRef();
  const [mouseDownIsMinimap, setMouseDownIsMinimap] = useState(false);

  const [deckSize, setDeckSize] = useState(null);
  const settings = useSettings({ query, updateQuery });
  const view = useView({
    settings,
    deckSize,
    deckRef,
    jbrowseRef,
    mouseDownIsMinimap,
  });

  // Add state for lineage sidebar visibility
  const [lineageSidebarOpen, setLineageSidebarOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Add a state for the selected lineage
  const [selectedLineage, setSelectedLineage] = useState(null);
  
  // Create stable references to view data to prevent unnecessary rerendering
  const [lineageData, setLineageData] = useState([]);
  
  // Update lineage data when view.keyStuff changes, directly pass data
  useEffect(() => {
    if (view && view.keyStuff) {
      setLineageData(view.keyStuff);
    }
  }, [view?.keyStuff]);

  // Function to handle lineage selection
  const handleLineageSelect = (lineage) => {
    setSelectedLineage(lineage);
    
    // Store the selected lineage for filtering all nodes
    if (view) {
      // Store the selected lineage for display highlighting and filtering
      view.hoveredKey = lineage;
      
      // Add a new property to track lineage for node filtering
      view.currentFilteredLineage = lineage;
      
      // Call setHoveredKey if available to ensure UI updates
      if (view.setHoveredKey) {
        view.setHoveredKey(lineage);
      }
      
      // Force a view update to ensure nodes are filtered
      if (view.viewState && view.viewState.target) {
        // Trigger a tiny view change to force redraw
        const currentTarget = [...view.viewState.target];
        view.viewState = {
          ...view.viewState,
          target: currentTarget
        };
      }
    }
  };

  // Initialize view properties to avoid undefined errors
  useEffect(() => {
    if (view) {
      // Initialize keyStuff as empty array if not present
      if (!view.keyStuff) {
        view.keyStuff = [];
      }
      
      // Initialize hoveredKey if not present
      if (view.hoveredKey === undefined) {
        view.hoveredKey = null;
      }
      
      // Ensure setHoveredKey exists
      if (!view.setHoveredKey) {
        view.setHoveredKey = (newKey) => {
          setSelectedLineage(newKey);
        };
      }
    }
  }, [view, setSelectedLineage]);

  const backend = useBackend(
    backendUrl ? backendUrl : query.backend,
    query.sid,
    sourceData
  );
  let hoverDetails = useHoverDetails();
  const gisaidHoverDetails = useNodeDetails("gisaid-hovered", backend);
  if (window.location.toString().includes("epicov.org")) {
    hoverDetails = gisaidHoverDetails;
  }
  const selectedDetails = useNodeDetails("selected", backend);

  const config = useConfig(
    backend,
    view,
    setOverlayContent,
    setTitle,
    query,
    configDict,
    configUrl
  );
  const colorBy = useColorBy(config, query, updateQuery);
  const [additionalColorMapping, setAdditionalColorMapping] = useState({});
  const colorMapping = useMemo(() => {
    const initial = config.colorMapping ? config.colorMapping : {};
    return { ...initial, ...additionalColorMapping };
  }, [config.colorMapping, additionalColorMapping]);
  const colorHook = useColor(config, colorMapping, colorBy.colorByField);

  //TODO: this is always true for now
  config.enable_ns_download = true;

  const xType = query.xType ? query.xType : "x_dist";

  const setxType = useCallback(
    (xType) => {
      updateQuery({ xType });
    },
    [updateQuery]
  );

  const { data, boundsForQueries, isCurrentlyOutsideBounds } =
    useGetDynamicData(backend, colorBy, view.viewState, config, xType);

  const perNodeFunctions = usePerNodeFunctions(data, config);

  useEffect(() => {
    // If there is no distance data, default to time
    // This can happen with e.g. nextstrain json
    if (data.base_data && data.base_data.nodes) {
      const n = data.base_data.nodes[0];
      if (!n.hasOwnProperty("x_dist")) {
        setxType("x_time");
      } else if (!n.hasOwnProperty("x_time")) {
        setxType("x_dist");
      }
    }
  }, [data.base_data, setxType]);

  const search = useSearch({
    data,
    config,
    boundsForQueries,
    view,
    backend,
    query,
    updateQuery,
    deckSize,
    xType,
    settings,
  });

  const toggleLineageSidebar = () => {
    setLineageSidebarOpen(!lineageSidebarOpen);
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);
  };

  const treenomeState = useTreenomeState(data, deckRef, view, settings);

  const isPangoLineageField = useMemo(() => {
    return (
      colorBy.colorByField === "meta_pangolin_lineage" ||
      (typeof colorBy.colorByField === "string" && 
       (colorBy.colorByField.toLowerCase().includes("pango") || 
        colorBy.colorByField.toLowerCase().includes("lineage")))
    );
  }, [colorBy.colorByField]);

  return (
    <div className="w-full h-full flex">
      <Toaster />
      <ReactTooltip
        delayHide={400}
        className="infoTooltip"
        place="top"
        backgroundColor="#e5e7eb"
        textColor="#000"
        effect="solid"
      />
      <div className="flex-grow overflow-hidden flex flex-row">
        <LineageTools
          keyStuff={lineageData.length > 0 ? lineageData : view?.keyStuff || []}
          colorHook={colorHook}
          colorByField={colorBy.colorByField || ''}
          onCategorySelect={handleLineageSelect}
          selectedCategory={selectedLineage}
          isPangoLineageField={isPangoLineageField}
          toggleSidebar={toggleLineageSidebar}
          isVisible={lineageSidebarOpen}
          data={data} 
          xType={view?.xType || 'x_dist'}
        />

        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          <div
            className={`
              h-1/2 md:h-full w-full md:flex-grow
              ${lineageSidebarOpen ? 'md:pl-0' : 'md:pl-0'}
              ${sidebarOpen 
                ? (settings.treenomeEnabled ? "md:w-3/4 2xl:w-3/4" : "md:w-2/3") 
                : "md:w-full"
              }
            `}
          >
            {!lineageSidebarOpen && (
              <button 
                onClick={toggleLineageSidebar}
                className="absolute z-10 left-0 top-1/2 transform -translate-y-1/2 bg-white rounded-r py-2 px-1 shadow-md border border-l-0"
                title="Show Lineage Tools"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            <Deck
              statusMessage={backend.statusMessage}
              data={data}
              search={search}
              view={view}
              colorHook={colorHook}
              colorBy={colorBy}
              config={config}
              ariaHideApp={false}
              hoverDetails={hoverDetails}
              selectedDetails={selectedDetails}
              xType={xType}
              settings={settings}
              setDeckSize={setDeckSize}
              deckSize={deckSize}
              isCurrentlyOutsideBounds={isCurrentlyOutsideBounds}
              treenomeState={treenomeState}
              deckRef={deckRef}
              mouseDownIsMinimap={mouseDownIsMinimap}
              setMouseDownIsMinimap={setMouseDownIsMinimap}
              jbrowseRef={jbrowseRef}
              setAdditionalColorMapping={setAdditionalColorMapping}
            />
          </div>

          <div
            className={
              sidebarOpen
                ? "flex-grow min-h-0 h-1/2 md:h-full 2xl:w-1/4 bg-white shadow-xl border-t md:border-0 overflow-y-auto md:overflow-hidden" +
                  (settings.treenomeEnabled ? " md:w-1/4" : " md:w-1/3")
                : "bg-white shadow-xl"
            }
          >
            {!sidebarOpen && (
              <button onClick={toggleSidebar}>
                <br />
                {window.innerWidth > 768 ? (
                  <MdArrowBack className="mx-auto w-5 h-5 sidebar-toggle" />
                ) : (
                  <MdArrowUpward className="mx-auto w-5 h-5 sidebar-toggle" />
                )}
              </button>
            )}

            {sidebarOpen && (
              <SearchPanel
                className="flex-grow min-h-0 h-full bg-white shadow-xl border-t md:border-0 overflow-y-auto md:overflow-hidden"
                backend={backend}
                search={search}
                colorBy={colorBy}
                colorHook={colorHook}
                config={config}
                selectedDetails={selectedDetails}
                xType={xType}
                setxType={setxType}
                settings={settings}
                treenomeState={treenomeState}
                view={view}
                overlayContent={overlayContent}
                setAboutEnabled={setAboutEnabled}
                perNodeFunctions={perNodeFunctions}
                toggleSidebar={toggleSidebar}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Taxonium;
