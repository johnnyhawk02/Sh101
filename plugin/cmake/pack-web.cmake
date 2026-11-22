# Copies site/ (the web app, less the service worker and the mockups) and plugin/web/ (the bridge and the fonts, as
# plugin/...) into one folder and zips it.
file(REMOVE_RECURSE ${STAGE})
file(COPY ${SITE}/ DESTINATION ${STAGE})
file(REMOVE_RECURSE ${STAGE}/mockups)
file(REMOVE ${STAGE}/sw.js)
file(COPY ${WEB}/ DESTINATION ${STAGE}/plugin)
file(GLOB_RECURSE files RELATIVE ${STAGE} ${STAGE}/*)
file(REMOVE ${OUT})
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${OUT} --format=zip -- ${files} WORKING_DIRECTORY ${STAGE} RESULT_VARIABLE rc)
if(NOT rc EQUAL 0)
  message(FATAL_ERROR "zipping the web app failed")
endif()
