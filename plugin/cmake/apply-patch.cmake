# Applies PATCH to the current directory (the JUCE checkout) once; does nothing if it is already applied.
execute_process(COMMAND git apply --reverse --check ${PATCH} RESULT_VARIABLE already OUTPUT_QUIET ERROR_QUIET)
if(NOT already EQUAL 0)
  execute_process(COMMAND git apply ${PATCH} RESULT_VARIABLE rc)
  if(NOT rc EQUAL 0)
    message(FATAL_ERROR "Could not apply ${PATCH} to JUCE")
  endif()
endif()
